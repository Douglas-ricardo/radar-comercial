# app/services/outreach_service.py
"""Dispatcher de disparo ao cliente final — WhatsApp (Evolution) + Email (Resend).

Camada única de envio: gera a mensagem por IA (Claude Haiku), envia pelos canais
habilitados na OutreachConfig da empresa e registra cada envio em OutreachLog
(para dedup, métricas e auditoria).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, date

from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.domain.models import (
    CustomerProfile, OutreachConfig, OutreachLog, OpportunityAction, ContactOptOut, OutreachAttribution,
    CadenceEnrollment,
)
from app.services.notification_service import NotificationService
from app.services import evolution_client

logger = logging.getLogger(__name__)

_HAIKU_MODEL = "claude-haiku-4-5-20251001"

_SEGMENT_LABELS = {
    "champion": "cliente campeão (compra muito e com frequência)",
    "loyal": "cliente fiel (compra regularmente)",
    "at_risk": "cliente em risco (comprou bem antes, sumiu)",
    "lost": "cliente perdido (sem compras há muito tempo)",
    "new": "cliente novo (poucas compras)",
}


_MSG_CACHE_TTL = 60 * 60 * 72  # 72h — alinhado ao recompute do CustomerProfile


def _cache_key(profile: CustomerProfile) -> str:
    computed = profile.computed_at.date().isoformat() if profile.computed_at else "na"
    return f"outreach_msg:{profile.company_id}:{profile.customer_hash}:{computed}"


def generate_message(profile: CustomerProfile, sender_name: str | None) -> str:
    """Gera mensagem de reativação em pt-BR via Claude. Fallback estático se sem IA.
    Cache Redis 72h por (company, customer, data de cômputo) — evita custo repetido."""
    from app.infrastructure.redis_client import redis_client
    cache_key = _cache_key(profile)
    try:
        cached = redis_client.get(cache_key)
        if cached:
            return cached.decode() if isinstance(cached, (bytes, bytearray)) else cached
    except Exception as exc:
        logger.warning("outreach.generate.cache_unavailable", extra={"error": str(exc)})

    api_key = os.getenv("ANTHROPIC_API_KEY")
    rfv = profile.rfv or {}
    segment = rfv.get("segment", "lost")
    days = profile.recency_days or 0
    last_products = ", ".join(
        p.get("product", "") for p in (profile.top_products or [])[:2] if p.get("product")
    )
    assinatura = sender_name or "Equipe de vendas"

    if not api_key:
        # Fallback sem IA — ainda personalizado com os dados reais
        prod = f" Temos novidades em {last_products}." if last_products else ""
        return (
            f"Olá {profile.customer_name}! Notamos que faz um tempo desde sua última compra."
            f"{prod} Posso te ajudar com um pedido especial? — {assinatura}"
        )

    prompt = f"""Você é um assistente comercial brasileiro. Gere UMA mensagem curta para
reativar este cliente, pronta para enviar no WhatsApp. Regras:
- Português brasileiro, tom pessoal e consultivo (não robótico, sem jargão corporativo)
- Mencione naturalmente o tempo sem comprar e os produtos de interesse
- Máximo 3 parágrafos curtos, no máximo 2 emojis
- Termine com uma pergunta ou chamada para ação
- Assine como "{assinatura}"

DADOS:
- Nome: {profile.customer_name}
- Perfil: {_SEGMENT_LABELS.get(segment, segment)}
- Dias sem comprar: {days}
- Produtos de interesse: {last_products or 'variados'}

Gere apenas o texto da mensagem, sem títulos."""

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        resp = client.messages.create(
            model=_HAIKU_MODEL, max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
        message = resp.content[0].text.strip()
        try:
            redis_client.setex(cache_key, _MSG_CACHE_TTL, message)
        except Exception:
            pass
        return message
    except Exception as exc:
        logger.warning("outreach.generate.fallback", extra={"error": str(exc)})
        prod = f" Temos novidades em {last_products}." if last_products else ""
        return (
            f"Olá {profile.customer_name}! Faz um tempo desde sua última compra."
            f"{prod} Posso te ajudar? — {assinatura}"
        )


# Palavras que sinalizam descadastro numa resposta do cliente (pt-BR).
_STOP_KEYWORDS = {"pare", "parar", "sair", "stop", "cancelar", "descadastrar", "remover", "nao quero", "não quero"}


def is_stop_message(text: str | None) -> bool:
    if not text:
        return False
    t = text.strip().lower()
    # casa quando a mensagem É a palavra (ex.: "PARE") ou começa com ela
    return any(t == kw or t.startswith(kw + " ") or t == kw + "." for kw in _STOP_KEYWORDS)


def process_inbound_reply(db: Session, company_id: str, phone_e164: str, text: str, push_name: str | None = None) -> dict:
    """
    Processa uma resposta recebida do cliente final (webhook Evolution):
      - acha o cliente pelo telefone (dentro da empresa);
      - se for "PARE"/etc → opt-out durável (LGPD);
      - registra a resposta como OutreachLog (channel=whatsapp_in) → vendedor vê lead quente.
    """
    profile = db.query(CustomerProfile).filter_by(
        company_id=company_id, phone=phone_e164
    ).first()
    customer_hash = profile.customer_hash if profile else None
    customer_name = profile.customer_name if profile else (push_name or "Desconhecido")

    opted_out = False
    if is_stop_message(text) and customer_hash:
        record_opt_out(db, company_id, customer_hash, source="reply_stop")
        opted_out = True

    # Registra a resposta (status "received") — base para "X clientes responderam"
    db.add(OutreachLog(
        company_id=company_id, customer_hash=customer_hash or "unknown",
        customer_name=customer_name, channel="whatsapp_in", status="received",
    ))
    db.commit()
    logger.info("outreach.inbound.processed", extra={
        "company_id": company_id, "matched": bool(customer_hash), "opted_out": opted_out,
    })
    return {"matched": bool(customer_hash), "opted_out": opted_out}


def is_opted_out(db: Session, company_id: str, customer_hash: str) -> bool:
    """Opt-out durável (LGPD): verdade está em ContactOptOut, sobrevive a re-uploads."""
    return db.query(ContactOptOut).filter_by(
        company_id=company_id, customer_hash=customer_hash
    ).first() is not None


def record_opt_out(db: Session, company_id: str, customer_hash: str, source: str = "manual") -> None:
    """Registra opt-out durável e reflete no CustomerProfile (cache)."""
    exists = db.query(ContactOptOut).filter_by(
        company_id=company_id, customer_hash=customer_hash
    ).first()
    if not exists:
        db.add(ContactOptOut(company_id=company_id, customer_hash=customer_hash, source=source))
    db.query(CustomerProfile).filter_by(
        company_id=company_id, customer_hash=customer_hash
    ).update({"contact_opt_out": True})
    db.commit()


def _format_customer_email(
    customer_name: str, body: str, sender_name: str, company_name: str, unsubscribe_url: str | None = None
) -> str:
    """E-mail formal ao cliente final, assinado pelo vendedor/empresa.
    Inclui link de descadastro (exigência de email marketing / LGPD)."""
    paragraphs = "".join(
        f"<p style='margin:0 0 12px'>{line}</p>" for line in body.split("\n") if line.strip()
    )
    unsub = (
        f'<p style="color:#999;font-size:11px;margin-top:8px">'
        f'Não deseja mais receber estas mensagens? '
        f'<a href="{unsubscribe_url}" style="color:#999">Descadastrar</a>.</p>'
        if unsubscribe_url else ""
    )
    return f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e">
      <p style="margin:0 0 12px">Prezado(a) {customer_name},</p>
      {paragraphs}
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;color:#555;font-size:14px">
        <p style="margin:0"><strong>{sender_name}</strong></p>
        <p style="margin:4px 0 0">{company_name}</p>
      </div>
      <p style="color:#999;font-size:11px;margin-top:24px">
        Você recebeu este e-mail por ser cliente de {company_name}.
      </p>
      {unsub}
    </div>
    """


def already_sent_today(db: Session, company_id: str, customer_hash: str) -> bool:
    """Evita reenvio: já houve envio com sucesso para este cliente nas últimas 24h?"""
    since = utcnow() - timedelta(hours=24)
    return db.query(OutreachLog).filter(
        OutreachLog.company_id == company_id,
        OutreachLog.customer_hash == customer_hash,
        OutreachLog.status == "sent",
        OutreachLog.sent_at >= since,
    ).first() is not None


def _mark_contacted_in_carteira(db: Session, company_id: str, user_id: str, profile: CustomerProfile) -> None:
    """Sincroniza a Carteira: oportunidade vira 'contacted' após o disparo.
    Não rebaixa quem já está won/lost (decisão comercial mais avançada vence)."""
    if not user_id:
        return
    action = db.query(OpportunityAction).filter_by(
        company_id=company_id, user_id=user_id, opportunity_id=profile.customer_hash
    ).first()
    if action:
        if action.status == "to_contact":
            action.status = "contacted"
    else:
        db.add(OpportunityAction(
            company_id=company_id, user_id=user_id,
            opportunity_id=profile.customer_hash,
            customer_name=profile.customer_name,
            expected_value=profile.total_revenue or 0.0,
            status="contacted",
        ))


def _do_whatsapp(db: Session, config: OutreachConfig, profile: CustomerProfile, message: str) -> bool | None:
    """Envia 1 mensagem WhatsApp e loga. None se canal indisponível p/ este cliente."""
    if not (config.whatsapp_enabled and profile.phone and config.whatsapp_status == "connected"):
        return None
    company_id = config.company_id
    try:
        evolution_client.send_text(config.evolution_instance or company_id, profile.phone, message)
        db.add(OutreachLog(company_id=company_id, customer_hash=profile.customer_hash,
                           customer_name=profile.customer_name, channel="whatsapp", status="sent"))
        return True
    except Exception as exc:
        logger.error("outreach.whatsapp.error", extra={"error": str(exc)})
        db.add(OutreachLog(company_id=company_id, customer_hash=profile.customer_hash,
                           customer_name=profile.customer_name, channel="whatsapp",
                           status="failed", error=str(exc)[:300]))
        return False


def _do_email(db: Session, config: OutreachConfig, profile: CustomerProfile, message: str, company_name: str) -> bool | None:
    """Envia 1 email e loga. None se canal indisponível p/ este cliente."""
    if not (config.email_enabled and profile.email):
        return None
    company_id = config.company_id
    try:
        from app.core.unsubscribe import make_unsubscribe_token
        base = os.getenv("APP_BASE_URL", "http://localhost:3000").rstrip("/")
        token = make_unsubscribe_token(company_id, profile.customer_hash)
        unsubscribe_url = f"{base}/api/outreach/unsubscribe?token={token}"
        html = _format_customer_email(
            profile.customer_name, message,
            config.sender_name or company_name, company_name, unsubscribe_url,
        )
        ok = NotificationService.send_email(
            profile.email, f"{company_name} — temos novidades para você", html
        )
        db.add(OutreachLog(company_id=company_id, customer_hash=profile.customer_hash,
                           customer_name=profile.customer_name, channel="email",
                           status="sent" if ok else "failed"))
        return ok
    except Exception as exc:
        logger.error("outreach.email.error", extra={"error": str(exc)})
        db.add(OutreachLog(company_id=company_id, customer_hash=profile.customer_hash,
                           customer_name=profile.customer_name, channel="email",
                           status="failed", error=str(exc)[:300]))
        return False


def dispatch_to_customer(
    db: Session,
    config: OutreachConfig,
    profile: CustomerProfile,
    company_name: str,
    message: str | None = None,
    user_id: str | None = None,
) -> dict:
    """
    Envia para um cliente pelos canais habilitados (disparo único). Retorna {whatsapp, email}.
    Registra cada tentativa em OutreachLog. Não dispara para opt-out.
    Ao enviar com sucesso, marca a oportunidade como 'contacted' na Carteira.
    """
    result: dict = {"whatsapp": None, "email": None}
    company_id = config.company_id

    # Opt-out: respeita tanto o cache no perfil quanto a fonte durável (LGPD).
    if profile.contact_opt_out or is_opted_out(db, company_id, profile.customer_hash):
        return result

    if message is None:
        message = generate_message(profile, config.sender_name)

    result["whatsapp"] = _do_whatsapp(db, config, profile, message)
    result["email"] = _do_email(db, config, profile, message, company_name)

    # Sincroniza Carteira + abre atribuição (loop de receita) se algum canal teve sucesso
    if result.get("whatsapp") or result.get("email"):
        _mark_contacted_in_carteira(db, company_id, user_id, profile)
        channel = "both" if (result.get("whatsapp") and result.get("email")) else (
            "whatsapp" if result.get("whatsapp") else "email"
        )
        _open_attribution(db, company_id, profile, channel)

    db.commit()
    return result


def _open_attribution(db: Session, company_id: str, profile: CustomerProfile, channel: str) -> None:
    """Abre uma atribuição pendente com snapshot do estado 'churned' no contato.
    Idempotente: se já há uma pendente para o cliente, não cria outra."""
    pending = db.query(OutreachAttribution).filter_by(
        company_id=company_id, customer_hash=profile.customer_hash, status="pending"
    ).first()
    if pending:
        return
    db.add(OutreachAttribution(
        company_id=company_id,
        customer_hash=profile.customer_hash,
        customer_name=profile.customer_name,
        channel=channel,
        last_purchase_at_contact=profile.last_purchase_date,
        revenue_at_contact=profile.total_revenue or 0.0,
    ))


# Janela de atribuição: uma compra conta como "recuperada" se ocorrer até N dias
# após o contato. 30d é o padrão (ajustável no futuro via OutreachConfig).
_ATTRIBUTION_WINDOW_DAYS = 30


def _parse_iso_date(value) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None


def resolve_attributions(db: Session, company_id: str, window_days: int = _ATTRIBUTION_WINDOW_DAYS) -> dict:
    """
    Chamado pelo ETL após reconstruir os CustomerProfile. Para cada atribuição
    pendente da empresa:
      - se o cliente voltou a comprar (última compra avançou para depois do snapshot
        e a partir da data do contato) → 'recovered', valor = delta de receita;
      - se passou a janela sem nova compra → 'expired'.
    Retorna resumo {recovered, expired, recovered_value}.
    """
    pendentes = db.query(OutreachAttribution).filter_by(
        company_id=company_id, status="pending"
    ).all()
    if not pendentes:
        return {"recovered": 0, "expired": 0, "recovered_value": 0.0}

    # perfis atuais por hash (1 query)
    profiles = {
        p.customer_hash: p
        for p in db.query(CustomerProfile).filter_by(company_id=company_id).all()
    }

    recovered = expired = 0
    recovered_value = 0.0
    now = utcnow()

    for attr in pendentes:
        contacted_date = attr.contacted_at.date() if attr.contacted_at else None
        snapshot_last = _parse_iso_date(attr.last_purchase_at_contact)
        prof = profiles.get(attr.customer_hash)
        new_last = _parse_iso_date(prof.last_purchase_date) if prof else None

        comprou_depois = (
            new_last is not None
            and contacted_date is not None
            and new_last >= contacted_date
            and (snapshot_last is None or new_last > snapshot_last)
            and (new_last - contacted_date).days <= window_days
        )

        if comprou_depois:
            delta = (prof.total_revenue or 0.0) - (attr.revenue_at_contact or 0.0)
            attr.recovered_value = round(max(delta, 0.0), 2)
            attr.status = "recovered"
            attr.resolved_at = now
            recovered += 1
            recovered_value += attr.recovered_value
        elif contacted_date is not None and (now.date() - contacted_date).days > window_days:
            attr.status = "expired"
            attr.resolved_at = now
            expired += 1

    db.commit()
    logger.info("outreach.attribution.resolved", extra={
        "company_id": company_id, "recovered": recovered, "expired": expired,
    })
    return {"recovered": recovered, "expired": expired, "recovered_value": round(recovered_value, 2)}


# ─────────────────────────────────────────────────────────────────────────────
# Cadência multi-toque — sequência de mensagens espaçadas, agendada (sem sleep).
# ─────────────────────────────────────────────────────────────────────────────

# Sequência padrão: dia 0 WhatsApp → dia 3 email → dia 7 follow-up WhatsApp.
# Se o canal de um passo não estiver disponível p/ o cliente, o passo é pulado.
DEFAULT_CADENCE = [
    {"day": 0, "channel": "whatsapp"},
    {"day": 3, "channel": "email"},
    {"day": 7, "channel": "whatsapp"},
]


def enroll_in_cadence(db: Session, company_id: str, profile: CustomerProfile) -> bool:
    """Inscreve o cliente na cadência se não houver inscrição ativa. Retorna True se criou."""
    if profile.contact_opt_out or is_opted_out(db, company_id, profile.customer_hash):
        return False
    active = db.query(CadenceEnrollment).filter_by(
        company_id=company_id, customer_hash=profile.customer_hash, status="active"
    ).first()
    if active:
        return False
    db.add(CadenceEnrollment(
        company_id=company_id, customer_hash=profile.customer_hash,
        customer_name=profile.customer_name, step_index=0,
        status="active", next_run_at=utcnow(),
    ))
    return True


def _cadence_stop_reason(db: Session, company_id: str, enr: CadenceEnrollment) -> str | None:
    """Motivo para parar a cadência: opt-out, resposta ou compra (recovered)."""
    if is_opted_out(db, company_id, enr.customer_hash):
        return "opted_out"
    # respondeu depois de entrar na cadência → engajou, passa pro humano
    replied = db.query(OutreachLog).filter(
        OutreachLog.company_id == company_id,
        OutreachLog.customer_hash == enr.customer_hash,
        OutreachLog.channel == "whatsapp_in",
        OutreachLog.sent_at >= enr.enrolled_at,
    ).first()
    if replied:
        return "replied"
    # voltou a comprar (atribuição resolvida) → objetivo cumprido
    recovered = db.query(OutreachAttribution).filter_by(
        company_id=company_id, customer_hash=enr.customer_hash, status="recovered"
    ).first()
    if recovered:
        return "recovered"
    return None


def process_due_enrollments(db: Session, company_id: str, company_name: str, limit: int = 50) -> dict:
    """
    Processa as inscrições cuja próxima etapa venceu (next_run_at <= agora).
    Para cada uma: checa parada → envia o canal do passo atual → agenda o próximo.
    Sem `time.sleep`: o espaçamento vem do next_run_at (resolve o #7 da auditoria).
    """
    now = utcnow()
    due = (
        db.query(CadenceEnrollment)
        .filter(
            CadenceEnrollment.company_id == company_id,
            CadenceEnrollment.status == "active",
            CadenceEnrollment.next_run_at <= now,
        )
        .order_by(CadenceEnrollment.next_run_at.asc())
        .limit(limit)
        .all()
    )
    if not due:
        return {"processed": 0, "sent": 0, "stopped": 0, "completed": 0}

    config = db.query(OutreachConfig).filter_by(company_id=company_id).first()
    if not config:
        return {"processed": 0, "sent": 0, "stopped": 0, "completed": 0}

    sent = stopped = completed = 0
    for enr in due:
        # parada antecipada?
        reason = _cadence_stop_reason(db, company_id, enr)
        if reason:
            enr.status = "stopped"
            enr.stop_reason = reason
            stopped += 1
            continue

        profile = db.query(CustomerProfile).filter_by(
            company_id=company_id, customer_hash=enr.customer_hash
        ).first()
        if not profile:
            enr.status = "stopped"
            enr.stop_reason = "no_profile"
            stopped += 1
            continue

        steps = DEFAULT_CADENCE
        step = steps[enr.step_index] if enr.step_index < len(steps) else None
        if step is not None:
            message = generate_message(profile, config.sender_name)
            ok = None
            if step["channel"] == "whatsapp":
                ok = _do_whatsapp(db, config, profile, message)
            elif step["channel"] == "email":
                ok = _do_email(db, config, profile, message, company_name)
            if ok:  # primeiro toque efetivo → carteira + atribuição
                sent += 1
                _mark_contacted_in_carteira(db, company_id, None, profile)
                _open_attribution(db, company_id, profile, step["channel"])
            enr.last_step_at = now

        # avança para o próximo passo
        enr.step_index += 1
        if enr.step_index >= len(steps):
            enr.status = "completed"
            completed += 1
        else:
            next_day = steps[enr.step_index]["day"]
            enr.next_run_at = enr.enrolled_at + timedelta(days=next_day)

    db.commit()
    logger.info("outreach.cadence.processed", extra={
        "company_id": company_id, "sent": sent, "stopped": stopped, "completed": completed,
    })
    return {"processed": len(due), "sent": sent, "stopped": stopped, "completed": completed}
