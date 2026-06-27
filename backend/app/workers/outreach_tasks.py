# app/workers/outreach_tasks.py
"""Disparo automático ao cliente final (WhatsApp + Email).

- send_daily_outreach: Celery Beat, varre empresas com auto_send_enabled e
  enfileira uma task por empresa.
- run_company_outreach: processa uma empresa — seleciona oportunidades elegíveis,
  gera mensagem por IA e dispara pelos canais, com intervalo aleatório (anti-ban)
  e teto diário.
"""
import logging
import random
import time
from datetime import datetime, timedelta
from app.core.clock import utcnow

from app.core.celery_app import celery_app
from app.infrastructure.database import SessionLocal
from app.infrastructure.redis_client import redis_client
from app.domain.models import Company, CustomerProfile, OutreachConfig, OutreachLog, CadenceEnrollment
from app.services import outreach_service, evolution_client

logger = logging.getLogger(__name__)


def _sync_whatsapp_status(db, config: OutreachConfig) -> None:
    """Reconcilia o whatsapp_status com o estado REAL da instância no Evolution.

    O status no banco só era atualizado pelo polling do frontend na tela de QR.
    Se o usuário fechava o modal antes do polling pegar o 'open', o banco ficava
    travado em 'connecting' e o worker pulava o WhatsApp silenciosamente. Aqui o
    worker se auto-corrige consultando o estado ao vivo antes de disparar.
    """
    if not (config.whatsapp_enabled and config.evolution_instance and evolution_client.is_configured()):
        return
    try:
        state = evolution_client.connection_state(config.evolution_instance)
    except evolution_client.EvolutionError as exc:
        logger.warning("outreach.status.sync_error", extra={"company_id": config.company_id, "error": str(exc)})
        return
    mapped = {"open": "connected", "connecting": "connecting"}.get(state, "disconnected")
    if mapped != config.whatsapp_status:
        logger.info("outreach.status.synced", extra={
            "company_id": config.company_id, "from": config.whatsapp_status, "to": mapped,
        })
        config.whatsapp_status = mapped
        db.commit()

# Status comercial (fonte única) que representa oportunidade de recuperação.
# Antes usava `segment` (RFV) — divergia da Carteira/Insights. Agora a elegibilidade do
# disparo usa o MESMO `status` canônico das oportunidades (quem aparece na Carteira == quem é contatado).
_TARGET_STATUSES = ("at_risk", "churned")
# Intervalo aleatório entre envios (segundos) — evita padrão de automação
_MIN_GAP, _MAX_GAP = 8, 25
# Lock por empresa — evita que beat + envio manual concorrentes furem o dedup
_OUTREACH_LOCK_TTL = 600  # 10 min (cobre um lote grande)


def _recently_sent_hashes(db, company_id: str) -> set:
    """Set de customer_hash com envio bem-sucedido nas últimas 24h — 1 query (sem N+1)."""
    since = utcnow() - timedelta(hours=24)
    rows = db.query(OutreachLog.customer_hash).filter(
        OutreachLog.company_id == company_id,
        OutreachLog.status == "sent",
        OutreachLog.sent_at >= since,
    ).distinct().all()
    return {r[0] for r in rows}


def _eligible_profiles(db, company_id: str, config: OutreachConfig) -> list:
    """Clientes elegíveis: oportunidade, com contato p/ canal ativo, sem opt-out."""
    q = (
        db.query(CustomerProfile)
        .filter(CustomerProfile.company_id == company_id)
        .filter(CustomerProfile.contact_opt_out.is_(False))
        .filter(CustomerProfile.status.in_(_TARGET_STATUSES))
    )
    if config.min_opportunity_value and config.min_opportunity_value > 0:
        q = q.filter(CustomerProfile.total_revenue >= config.min_opportunity_value)
    q = q.order_by(CustomerProfile.total_revenue.desc())

    sent_recently = _recently_sent_hashes(db, company_id)  # 1 query em vez de N
    profiles = []
    for p in q.all():
        has_wa = config.whatsapp_enabled and p.phone and config.whatsapp_status == "connected"
        has_email = config.email_enabled and p.email
        if not (has_wa or has_email):
            continue
        if p.customer_hash in sent_recently:
            continue
        profiles.append(p)
    return profiles


def run_company_outreach(db, company_id: str, company_name: str, user_id: str | None = None) -> dict:
    """Núcleo reutilizável. Retorna resumo {sent, failed, skipped}.
    user_id: a quem creditar a ação 'contacted' na Carteira (quem disparou ou dono).
    Protegido por lock Redis por empresa — disparos concorrentes não duplicam mensagens."""
    from app.domain.models import User

    lock = redis_client.lock(f"outreach_lock:{company_id}", timeout=_OUTREACH_LOCK_TTL, blocking_timeout=1)
    if not lock.acquire():
        logger.info("outreach.company.busy", extra={"company_id": company_id})
        return {"sent": 0, "failed": 0, "skipped": 0, "reason": "disparo já em andamento"}
    try:
        if not user_id:
            owner = db.query(User).filter_by(company_id=company_id, role="admin").first()
            user_id = owner.id if owner else None
        config = db.query(OutreachConfig).filter_by(company_id=company_id).first()
        if not config:
            return {"sent": 0, "failed": 0, "skipped": 0, "reason": "sem configuração"}
        if not (config.whatsapp_enabled or config.email_enabled):
            return {"sent": 0, "failed": 0, "skipped": 0, "reason": "nenhum canal ativo"}

        # Reconcilia o status do WhatsApp com o Evolution antes de decidir canais.
        _sync_whatsapp_status(db, config)

        profiles = _eligible_profiles(db, company_id, config)
        limit = max(config.daily_limit or 30, 0)
        profiles = profiles[:limit]

        # ── Modo cadência: inscreve na sequência; o envio é agendado (sem sleep) ──
        if config.cadence_enabled:
            enrolled = sum(
                1 for p in profiles if outreach_service.enroll_in_cadence(db, company_id, p)
            )
            db.commit()
            logger.info("outreach.company.enrolled", extra={"company_id": company_id, "enrolled": enrolled})
            return {"enrolled": enrolled, "mode": "cadence", "total": len(profiles)}

        # ── Modo disparo único (legado): envia agora, espaçado ───────────────────
        sent = failed = 0
        for i, profile in enumerate(profiles):
            res = outreach_service.dispatch_to_customer(db, config, profile, company_name, user_id=user_id)
            if res.get("whatsapp") or res.get("email"):
                sent += 1
            elif res.get("whatsapp") is False or res.get("email") is False:
                failed += 1
            # intervalo aleatório entre envios (exceto o último)
            if i < len(profiles) - 1:
                time.sleep(random.uniform(_MIN_GAP, _MAX_GAP))

        logger.info("outreach.company.done", extra={
            "company_id": company_id, "sent": sent, "failed": failed, "total": len(profiles),
        })
        return {"sent": sent, "failed": failed, "skipped": 0, "total": len(profiles)}
    finally:
        try:
            lock.release()
        except Exception:
            pass


@celery_app.task(name="run_company_outreach_task")
def run_company_outreach_task(company_id: str, company_name: str = "Empresa", user_id: str | None = None):
    db = SessionLocal()
    try:
        return run_company_outreach(db, company_id, company_name, user_id=user_id)
    finally:
        db.close()


@celery_app.task(name="send_daily_outreach")
def send_daily_outreach():
    """Beat horário: enfileira empresas com auto-envio ativo cujo send_hour == hora atual (BRT)."""
    from datetime import datetime, timezone, timedelta
    brt_hour = (datetime.now(timezone.utc) - timedelta(hours=3)).hour
    db = SessionLocal()
    try:
        configs = db.query(OutreachConfig).filter_by(auto_send_enabled=True).all()
        count = 0
        for cfg in configs:
            if (cfg.send_hour or 9) != brt_hour:
                continue
            company = db.query(Company).filter_by(id=cfg.company_id).first()
            name = company.name if company else "Empresa"
            run_company_outreach_task.delay(cfg.company_id, name)
            count += 1
        logger.info("outreach.daily.dispatched", extra={"companies": count, "brt_hour": brt_hour})
        return {"companies_dispatched": count, "brt_hour": brt_hour}
    finally:
        db.close()


@celery_app.task(name="process_cadence_steps")
def process_cadence_steps():
    """Beat: processa os passos de cadência vencidos de todas as empresas com
    inscrições ativas. DB-driven, sem sleep — cada passo é agendado por next_run_at."""
    db = SessionLocal()
    try:
        company_ids = [
            r[0] for r in db.query(CadenceEnrollment.company_id)
            .filter(CadenceEnrollment.status == "active")
            .distinct().all()
        ]
        total = {"processed": 0, "sent": 0, "stopped": 0, "completed": 0}
        for cid in company_ids:
            company = db.query(Company).filter_by(id=cid).first()
            name = company.name if company else "Empresa"
            r = outreach_service.process_due_enrollments(db, cid, name)
            for k in total:
                total[k] += r.get(k, 0)
        logger.info("outreach.cadence.tick", extra=total)
        return total
    finally:
        db.close()
