"""
P4 — cadência multi-toque: enroll, avanço de passos (agendado, sem sleep),
parada por resposta / opt-out / recovered.
"""
from datetime import timedelta

from app.core.clock import utcnow
from app.domain.models import (
    OutreachConfig, CustomerProfile, CadenceEnrollment, OutreachLog, ContactOptOut,
)
from app.services import outreach_service


def _config(db, cid, **kw):
    cfg = db.query(OutreachConfig).filter_by(company_id=cid).first()
    if not cfg:
        cfg = OutreachConfig(company_id=cid, evolution_instance=cid)
        db.add(cfg)
    cfg.email_enabled = kw.get("email_enabled", True)
    cfg.whatsapp_enabled = kw.get("whatsapp_enabled", False)
    cfg.cadence_enabled = True
    cfg.sender_name = "Vendas"
    db.commit()
    return cfg


def _profile(db, cid, chash, **kw):
    p = CustomerProfile(
        company_id=cid, customer_hash=chash, customer_name=f"Cli {chash}",
        segment="at_risk", total_revenue=1000.0,
        email=kw.get("email", "delivered@resend.dev"),
        phone=kw.get("phone"),
    )
    db.add(p); db.commit()
    return p


def test_enroll_cria_inscricao(db, company_a):
    cid = company_a["company"].id
    _config(db, cid)
    p = _profile(db, cid, "cad_001")
    created = outreach_service.enroll_in_cadence(db, cid, p)
    db.commit()
    assert created is True
    enr = db.query(CadenceEnrollment).filter_by(company_id=cid, customer_hash="cad_001").first()
    assert enr.status == "active" and enr.step_index == 0


def test_enroll_nao_duplica(db, company_a):
    cid = company_a["company"].id
    _config(db, cid)
    p = _profile(db, cid, "cad_002")
    assert outreach_service.enroll_in_cadence(db, cid, p) is True
    db.commit()
    assert outreach_service.enroll_in_cadence(db, cid, p) is False  # já ativa


def test_processa_passo_e_agenda_proximo(db, company_a):
    cid = company_a["company"].id
    _config(db, cid, email_enabled=True)
    p = _profile(db, cid, "cad_003")
    outreach_service.enroll_in_cadence(db, cid, p)
    db.commit()

    res = outreach_service.process_due_enrollments(db, cid, "Empresa A")
    assert res["processed"] == 1
    enr = db.query(CadenceEnrollment).filter_by(company_id=cid, customer_hash="cad_003").first()
    # avançou para o passo 1 e agendou para o futuro (dia 3)
    assert enr.step_index == 1 and enr.status == "active"
    assert enr.next_run_at > utcnow()


def test_para_em_opt_out(db, company_a):
    cid = company_a["company"].id
    _config(db, cid)
    p = _profile(db, cid, "cad_004")
    outreach_service.enroll_in_cadence(db, cid, p)
    db.commit()
    # cliente opta out antes do processamento
    outreach_service.record_opt_out(db, cid, "cad_004", source="manual")

    outreach_service.process_due_enrollments(db, cid, "Empresa A")
    enr = db.query(CadenceEnrollment).filter_by(company_id=cid, customer_hash="cad_004").first()
    assert enr.status == "stopped" and enr.stop_reason == "opted_out"


def test_para_em_resposta(db, company_a):
    cid = company_a["company"].id
    _config(db, cid)
    p = _profile(db, cid, "cad_005")
    outreach_service.enroll_in_cadence(db, cid, p)
    db.commit()
    # cliente responde depois de inscrito
    db.add(OutreachLog(company_id=cid, customer_hash="cad_005", channel="whatsapp_in", status="received"))
    db.commit()

    outreach_service.process_due_enrollments(db, cid, "Empresa A")
    enr = db.query(CadenceEnrollment).filter_by(company_id=cid, customer_hash="cad_005").first()
    assert enr.status == "stopped" and enr.stop_reason == "replied"


def test_run_company_outreach_enrolls_quando_cadence(db, company_a, monkeypatch):
    """No modo cadência, o daily run inscreve em vez de enviar inline."""
    from app.workers import outreach_tasks
    cid = company_a["company"].id
    _config(db, cid, email_enabled=True)
    # company_a já tem 1 perfil at_risk (hash_a_001) com phone; garante email p/ elegibilidade
    prof = db.query(CustomerProfile).filter_by(company_id=cid, customer_hash="hash_a_001").first()
    prof.email = "delivered@resend.dev"
    db.commit()

    res = outreach_tasks.run_company_outreach(db, cid, "Empresa A")
    assert res.get("mode") == "cadence"
    assert db.query(CadenceEnrollment).filter_by(company_id=cid, status="active").count() >= 1
