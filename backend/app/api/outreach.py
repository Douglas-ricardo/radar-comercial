# app/api/outreach.py
import logging
from datetime import datetime, timedelta
from app.core.clock import utcnow
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from fastapi.responses import HTMLResponse

from app.core.auth import get_current_user_and_company, require_analyst_or_above
from app.core.rate_limit import limiter
from app.core.unsubscribe import verify_unsubscribe_token
from app.core.webhook_sign import make_webhook_token, verify_webhook_token
from app.domain.models import Company, CustomerProfile, OutreachConfig, OutreachLog, ContactOptOut, OutreachAttribution, MessageTemplate
from app.infrastructure.database import get_db_session
from app.services import evolution_client, outreach_service
from data_engine.etl import normalize_phone_br

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/outreach", tags=["Outreach"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class OutreachConfigUpdate(BaseModel):
    auto_send_enabled: Optional[bool] = None
    whatsapp_enabled: Optional[bool] = None
    email_enabled: Optional[bool] = None
    sender_name: Optional[str] = None
    reply_to_email: Optional[str] = None
    send_hour: Optional[int] = None
    min_opportunity_value: Optional[float] = None
    daily_limit: Optional[int] = None
    cadence_enabled: Optional[bool] = None


class ContactUpdate(BaseModel):
    phone: Optional[str] = None
    email: Optional[str] = None
    contact_opt_out: Optional[bool] = None


class MessageTemplateRequest(BaseModel):
    name: str
    segment: str   # "at_risk" | "lost" | "all"
    content: str
    is_active: bool = True


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_or_create_config(db: Session, company_id: str) -> OutreachConfig:
    cfg = db.query(OutreachConfig).filter_by(company_id=company_id).first()
    if not cfg:
        cfg = OutreachConfig(company_id=company_id, evolution_instance=company_id)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def _serialize_config(cfg: OutreachConfig) -> dict:
    return {
        "autoSendEnabled": cfg.auto_send_enabled,
        "whatsappEnabled": cfg.whatsapp_enabled,
        "emailEnabled": cfg.email_enabled,
        "whatsappStatus": cfg.whatsapp_status,
        "whatsappNumber": cfg.whatsapp_number,
        "senderName": cfg.sender_name,
        "replyToEmail": cfg.reply_to_email,
        "sendHour": cfg.send_hour,
        "minOpportunityValue": cfg.min_opportunity_value,
        "dailyLimit": cfg.daily_limit,
        "cadenceEnabled": cfg.cadence_enabled,
        "evolutionConfigured": evolution_client.is_configured(),
    }


# ─── Config ───────────────────────────────────────────────────────────────────

@router.get("/config")
def get_config(token=Depends(require_analyst_or_above), db: Session = Depends(get_db_session)):
    cfg = _get_or_create_config(db, token.company_id)
    return {"success": True, "data": _serialize_config(cfg)}


@router.patch("/config")
def update_config(
    data: OutreachConfigUpdate,
    token=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if token.role not in ("admin", "analyst"):
        raise HTTPException(status_code=403, detail="Sem permissão.")
    cfg = _get_or_create_config(db, token.company_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(cfg, field, value)
    db.commit()
    db.refresh(cfg)
    return {"success": True, "data": _serialize_config(cfg)}


# ─── WhatsApp (Evolution) ─────────────────────────────────────────────────────

@router.post("/whatsapp/connect")
@limiter.limit("10/minute")
def whatsapp_connect(request: Request, token=Depends(get_current_user_and_company), db: Session = Depends(get_db_session)):
    """Cria a instância e retorna o QR Code (base64) para o vendedor escanear."""
    if token.role not in ("admin", "analyst"):
        raise HTTPException(status_code=403, detail="Sem permissão para conectar o WhatsApp.")
    if not evolution_client.is_configured():
        raise HTTPException(status_code=503, detail="Evolution API não configurada no servidor.")
    cfg = _get_or_create_config(db, token.company_id)
    instance = cfg.evolution_instance or token.company_id
    try:
        evolution_client.create_instance(instance)
        qr = evolution_client.connect(instance)
    except evolution_client.EvolutionError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    cfg.evolution_instance = instance
    cfg.whatsapp_status = "connecting"
    db.commit()

    # Registra o webhook para receber respostas do cliente (best-effort).
    try:
        import os
        base = os.getenv("APP_BASE_URL", "http://localhost:8000").rstrip("/")
        wh_token = make_webhook_token(token.company_id)
        evolution_client.set_webhook(instance, f"{base}/api/outreach/webhook/evolution?token={wh_token}")
    except Exception as exc:
        logger.warning("outreach.webhook.set_error", extra={"error": str(exc)})
    # QR pode vir em qr.base64 / qr.qrcode.base64 / code
    qrcode = (qr.get("base64") or (qr.get("qrcode") or {}).get("base64") or qr.get("code"))
    return {"success": True, "data": {"qrcode": qrcode}}


@router.get("/whatsapp/status")
def whatsapp_status(token=Depends(require_analyst_or_above), db: Session = Depends(get_db_session)):
    cfg = _get_or_create_config(db, token.company_id)
    if not evolution_client.is_configured() or not cfg.evolution_instance:
        return {"success": True, "data": {"status": "disconnected"}}
    try:
        state = evolution_client.connection_state(cfg.evolution_instance)
    except evolution_client.EvolutionError:
        state = "close"
    status = {"open": "connected", "connecting": "connecting"}.get(state, "disconnected")
    cfg.whatsapp_status = status
    db.commit()
    return {"success": True, "data": {"status": status, "whatsappNumber": cfg.whatsapp_number}}


@router.post("/whatsapp/disconnect")
def whatsapp_disconnect(token=Depends(get_current_user_and_company), db: Session = Depends(get_db_session)):
    if token.role not in ("admin", "analyst"):
        raise HTTPException(status_code=403, detail="Sem permissão para desconectar o WhatsApp.")
    cfg = _get_or_create_config(db, token.company_id)
    if cfg.evolution_instance and evolution_client.is_configured():
        try:
            evolution_client.logout(cfg.evolution_instance)
        except evolution_client.EvolutionError:
            pass
    cfg.whatsapp_status = "disconnected"
    cfg.whatsapp_number = None
    db.commit()
    return {"success": True, "data": _serialize_config(cfg)}


# ─── Contatos (cadastro manual + opt-out) ─────────────────────────────────────

@router.get("/contacts")
def list_contacts(token=Depends(require_analyst_or_above), db: Session = Depends(get_db_session)):
    """Lista clientes com contato, opt-out e último envio — base da tela de revisão."""
    profiles = (
        db.query(CustomerProfile)
        .filter_by(company_id=token.company_id)
        .order_by(CustomerProfile.total_revenue.desc())
        .all()
    )
    # último envio por cliente (24h)
    since = utcnow() - timedelta(hours=24)
    recent = {
        log.customer_hash
        for log in db.query(OutreachLog.customer_hash).filter(
            OutreachLog.company_id == token.company_id,
            OutreachLog.status == "sent",
            OutreachLog.sent_at >= since,
        ).all()
    }
    data = [
        {
            "customerHash": p.customer_hash,
            "customerName": p.customer_name,
            "phone": p.phone,
            "email": p.email,
            "optOut": p.contact_opt_out,
            "segment": p.segment,
            "recencyDays": p.recency_days,
            "totalRevenue": p.total_revenue,
            "sentRecently": p.customer_hash in recent,
        }
        for p in profiles
    ]
    return {"success": True, "data": data}


@router.patch("/contacts/{customer_hash}")
def update_contact(
    customer_hash: str,
    data: ContactUpdate,
    token=Depends(require_analyst_or_above),
    db: Session = Depends(get_db_session),
):
    profile = db.query(CustomerProfile).filter_by(
        company_id=token.company_id, customer_hash=customer_hash
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    payload = data.model_dump(exclude_unset=True)
    if "phone" in payload:
        profile.phone = normalize_phone_br(payload["phone"]) if payload["phone"] else None
    if "email" in payload:
        profile.email = (payload["email"] or "").strip().lower() or None
    if "contact_opt_out" in payload:
        opt_out = bool(payload["contact_opt_out"])
        profile.contact_opt_out = opt_out
        if opt_out:
            # registro durável (LGPD) — sobrevive a re-uploads
            outreach_service.record_opt_out(db, token.company_id, customer_hash, source="manual")
        else:
            # reativação manual: remove o registro durável
            db.query(ContactOptOut).filter_by(
                company_id=token.company_id, customer_hash=customer_hash
            ).delete()
    db.commit()
    return {"success": True, "data": {"customerHash": customer_hash}}


# ─── Disparo manual (botão "enviar agora") ────────────────────────────────────

@router.get("/preview")
@limiter.limit("15/minute")
def preview_message(request: Request, token=Depends(require_analyst_or_above), db: Session = Depends(get_db_session)):
    """Gera (sem enviar) a mensagem de um cliente elegível, para o vendedor revisar
    exatamente o que será disparado antes de confirmar."""
    cfg = _get_or_create_config(db, token.company_id)
    sample = (
        db.query(CustomerProfile)
        .filter(CustomerProfile.company_id == token.company_id)
        .filter(CustomerProfile.contact_opt_out.is_(False))
        .filter(CustomerProfile.segment.in_(["at_risk", "lost"]))
        .filter((CustomerProfile.phone.isnot(None)) | (CustomerProfile.email.isnot(None)))
        .order_by(CustomerProfile.total_revenue.desc())
        .first()
    )
    if not sample:
        return {"success": True, "data": {"message": None, "customerName": None,
                                          "reason": "Nenhum cliente elegível (sem contato ou todos em opt-out)."}}
    message = outreach_service.generate_message(sample, cfg.sender_name)
    ai = bool(__import__("os").getenv("ANTHROPIC_API_KEY")) and "xxxx" not in (__import__("os").getenv("ANTHROPIC_API_KEY") or "")
    return {"success": True, "data": {
        "message": message,
        "customerName": sample.customer_name,
        "aiEnabled": ai,
    }}


@router.delete("/contacts/{customer_hash}")
def erase_contact(
    customer_hash: str,
    token=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    """LGPD — direito à eliminação: apaga telefone/email do cliente e o marca opt-out durável."""
    if token.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem apagar dados de contato.")
    profile = db.query(CustomerProfile).filter_by(
        company_id=token.company_id, customer_hash=customer_hash
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    profile.phone = None
    profile.email = None
    profile.contact_opt_out = True
    outreach_service.record_opt_out(db, token.company_id, customer_hash, source="manual")
    db.commit()
    logger.info("outreach.contact.erased", extra={"company_id": token.company_id, "customer_hash": customer_hash})
    return {"success": True, "message": "Dados de contato apagados."}


@router.post("/send-now")
@limiter.limit("6/minute")
def send_now(request: Request, token=Depends(get_current_user_and_company), db: Session = Depends(get_db_session)):
    """Dispara o lote do dia imediatamente (respeita opt-out, dedup e teto diário)."""
    if token.role not in ("admin", "analyst"):
        raise HTTPException(status_code=403, detail="Sem permissão.")
    from app.workers.outreach_tasks import run_company_outreach_task
    company = db.query(Company).filter_by(id=token.company_id).first()
    run_company_outreach_task.delay(token.company_id, company.name if company else "Empresa", token.user_id)
    from app.services import usage_service
    usage_service.record_usage(db, token.company_id, "outreach")
    return {"success": True, "data": {"queued": True, "message": "Disparo iniciado em segundo plano."}}


@router.get("/recovery")
def recovery_summary(token=Depends(require_analyst_or_above), db: Session = Depends(get_db_session)):
    """Loop fechado: quanto de receita foi RECUPERADA via disparo (atribuição)."""
    attrs = db.query(OutreachAttribution).filter_by(company_id=token.company_id).all()
    recovered = [a for a in attrs if a.status == "recovered"]
    total_recovered = round(sum(a.recovered_value or 0.0 for a in recovered), 2)
    pending = sum(1 for a in attrs if a.status == "pending")
    replies = db.query(OutreachLog).filter_by(
        company_id=token.company_id, channel="whatsapp_in"
    ).count()

    by_channel: dict = {}
    for a in recovered:
        by_channel[a.channel or "outro"] = round(by_channel.get(a.channel or "outro", 0.0) + (a.recovered_value or 0.0), 2)

    recent = sorted(recovered, key=lambda a: a.resolved_at or a.contacted_at, reverse=True)[:10]
    return {
        "success": True,
        "data": {
            "totalRecovered": total_recovered,
            "recoveredCount": len(recovered),
            "pendingCount": pending,
            "repliesCount": replies,
            "byChannel": by_channel,
            "recent": [
                {
                    "customerName": a.customer_name,
                    "value": a.recovered_value,
                    "channel": a.channel,
                    "resolvedAt": a.resolved_at.isoformat() if a.resolved_at else None,
                }
                for a in recent
            ],
        },
    }


@router.get("/inbox")
def get_inbox(
    token=Depends(require_analyst_or_above),
    db: Session = Depends(get_db_session),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    """
    Caixa de entrada: mensagens recebidas dos clientes via WhatsApp.
    Armazenadas como OutreachLog channel='whatsapp_in' — sem texto (LGPD).
    """
    total = db.query(OutreachLog).filter(
        OutreachLog.company_id == token.company_id,
        OutreachLog.channel == "whatsapp_in",
    ).count()

    logs = (
        db.query(OutreachLog)
        .filter(
            OutreachLog.company_id == token.company_id,
            OutreachLog.channel == "whatsapp_in",
        )
        .order_by(OutreachLog.sent_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    # Batch-join com CustomerProfile para pegar phone/segment
    hashes = [log.customer_hash for log in logs]
    profiles_q = db.query(
        CustomerProfile.customer_hash,
        CustomerProfile.phone,
        CustomerProfile.segment,
        CustomerProfile.contact_opt_out,
    ).filter(
        CustomerProfile.company_id == token.company_id,
        CustomerProfile.customer_hash.in_(hashes),
    ).all()
    profile_map = {r[0]: {"phone": r[1], "segment": r[2], "optOut": r[3]} for r in profiles_q}

    data = []
    for log in logs:
        prof = profile_map.get(log.customer_hash, {})
        data.append({
            "id": log.id,
            "customerHash": log.customer_hash,
            "customerName": log.customer_name,
            "phone": prof.get("phone"),
            "segment": prof.get("segment"),
            "optOut": prof.get("optOut", False),
            "receivedAt": log.sent_at.isoformat() if log.sent_at else None,
        })

    return {
        "success": True,
        "data": data,
        "pagination": {"total": total, "limit": limit, "offset": offset},
    }


# ─── Templates de Mensagem ────────────────────────────────────────────────────

_VALID_SEGMENTS = {"at_risk", "lost", "all"}


@router.get("/templates")
def list_templates(token=Depends(require_analyst_or_above), db: Session = Depends(get_db_session)):
    templates = db.query(MessageTemplate).filter_by(company_id=token.company_id).order_by(MessageTemplate.created_at).all()
    return {"success": True, "data": [_serialize_template(t) for t in templates]}


@router.post("/templates")
def create_template(
    data: MessageTemplateRequest,
    token=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if token.role not in ("admin", "analyst"):
        raise HTTPException(status_code=403, detail="Sem permissão.")
    if data.segment not in _VALID_SEGMENTS:
        raise HTTPException(status_code=400, detail=f"Segmento inválido. Use: {', '.join(_VALID_SEGMENTS)}.")
    if not data.content.strip():
        raise HTTPException(status_code=400, detail="Conteúdo não pode ser vazio.")
    t = MessageTemplate(
        company_id=token.company_id,
        name=data.name.strip(),
        segment=data.segment,
        content=data.content.strip(),
        is_active=data.is_active,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"success": True, "data": _serialize_template(t)}


@router.put("/templates/{template_id}")
def update_template(
    template_id: str,
    data: MessageTemplateRequest,
    token=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if token.role not in ("admin", "analyst"):
        raise HTTPException(status_code=403, detail="Sem permissão.")
    t = db.query(MessageTemplate).filter_by(id=template_id, company_id=token.company_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template não encontrado.")
    if data.segment not in _VALID_SEGMENTS:
        raise HTTPException(status_code=400, detail=f"Segmento inválido. Use: {', '.join(_VALID_SEGMENTS)}.")
    t.name = data.name.strip()
    t.segment = data.segment
    t.content = data.content.strip()
    t.is_active = data.is_active
    db.commit()
    db.refresh(t)
    return {"success": True, "data": _serialize_template(t)}


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: str,
    token=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if token.role not in ("admin", "analyst"):
        raise HTTPException(status_code=403, detail="Sem permissão.")
    t = db.query(MessageTemplate).filter_by(id=template_id, company_id=token.company_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template não encontrado.")
    db.delete(t)
    db.commit()
    return {"success": True}


def _serialize_template(t: MessageTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "segment": t.segment,
        "content": t.content,
        "isActive": t.is_active,
        "createdAt": t.created_at.isoformat() if t.created_at else None,
        "updatedAt": t.updated_at.isoformat() if t.updated_at else None,
    }


def _extract_inbound(payload: dict) -> tuple[str, str, str] | None:
    """Extrai (phone_e164, texto, push_name) de um evento MESSAGES_UPSERT do Evolution.
    Ignora mensagens enviadas por nós (fromMe) e eventos sem texto."""
    from data_engine.etl import normalize_phone_br
    data = payload.get("data") or {}
    key = data.get("key") or {}
    if key.get("fromMe"):
        return None
    remote = key.get("remoteJid") or ""
    if "@g.us" in remote:  # ignora grupos
        return None
    digits = remote.split("@")[0]
    phone = normalize_phone_br(digits)
    msg = data.get("message") or {}
    text = (
        msg.get("conversation")
        or (msg.get("extendedTextMessage") or {}).get("text")
        or ""
    )
    if not phone or not text:
        return None
    return phone, text, data.get("pushName") or ""


@router.post("/webhook/evolution")
def evolution_webhook(payload: dict, token: str = "", db: Session = Depends(get_db_session)):
    """Recebe eventos do Evolution (respostas do cliente). Público, autenticado por
    token assinado na URL. Sempre retorna 200 para o Evolution não re-tentar em loop."""
    company_id = verify_webhook_token(token)
    if not company_id:
        return {"success": False, "error": "token inválido"}
    try:
        parsed = _extract_inbound(payload)
        if parsed:
            phone, text, push_name = parsed
            outreach_service.process_inbound_reply(db, company_id, phone, text, push_name)
    except Exception as exc:
        logger.warning("outreach.webhook.process_error", extra={"error": str(exc)})
    return {"success": True}


@router.get("/unsubscribe", response_class=HTMLResponse)
def unsubscribe(token: str, db: Session = Depends(get_db_session)):
    """Descadastro público (LGPD) — o cliente final clica no link do email.
    Sem autenticação: a identidade vem do token assinado."""
    parsed = verify_unsubscribe_token(token)
    if not parsed:
        return HTMLResponse(
            "<h3>Link inválido ou expirado.</h3>", status_code=400
        )
    company_id, customer_hash = parsed
    outreach_service.record_opt_out(db, company_id, customer_hash, source="email_unsubscribe")
    logger.info("outreach.unsubscribe", extra={"company_id": company_id, "customer_hash": customer_hash})
    return HTMLResponse(
        "<div style='font-family:Arial;max-width:480px;margin:40px auto;text-align:center'>"
        "<h2>Descadastro confirmado</h2>"
        "<p>Você não receberá mais mensagens. Obrigado.</p></div>"
    )
