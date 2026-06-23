"""
Loop fechado de receita recuperada (atribuição).
Verifica: cliente que volta a comprar após o contato → 'recovered' com valor = delta;
cliente que não volta dentro da janela → 'expired'; endpoint agrega o total.
"""
from datetime import timedelta

from app.core.clock import utcnow
from app.domain.models import CustomerProfile, OutreachAttribution
from app.services.outreach_service import resolve_attributions


def _profile(db, company_id, chash, last_purchase, total):
    db.add(CustomerProfile(
        company_id=company_id, customer_hash=chash, customer_name=f"Cli {chash}",
        segment="at_risk", total_revenue=total,
        last_purchase_date=last_purchase.isoformat() if last_purchase else None,
    ))
    db.commit()


def _attribution(db, company_id, chash, contacted_days_ago, snap_last, snap_revenue):
    attr = OutreachAttribution(
        company_id=company_id, customer_hash=chash, customer_name=f"Cli {chash}",
        channel="whatsapp",
        contacted_at=utcnow() - timedelta(days=contacted_days_ago),
        last_purchase_at_contact=snap_last.isoformat() if snap_last else None,
        revenue_at_contact=snap_revenue, status="pending",
    )
    db.add(attr)
    db.commit()
    return attr


def test_cliente_que_volta_a_comprar_e_recuperado(db, company_a):
    cid = company_a["company"].id
    today = utcnow().date()
    # snapshot no contato (10 dias atrás): última compra antiga, receita 1000
    # agora: comprou há 2 dias (depois do contato), receita 1500 → delta 500
    _profile(db, cid, "rec_001", last_purchase=today - timedelta(days=2), total=1500.0)
    _attribution(db, cid, "rec_001", contacted_days_ago=10,
                 snap_last=today - timedelta(days=40), snap_revenue=1000.0)

    summary = resolve_attributions(db, cid)
    assert summary["recovered"] == 1
    assert summary["recovered_value"] == 500.0

    attr = db.query(OutreachAttribution).filter_by(company_id=cid, customer_hash="rec_001").first()
    assert attr.status == "recovered" and attr.recovered_value == 500.0


def test_cliente_que_nao_volta_expira_apos_janela(db, company_a):
    cid = company_a["company"].id
    today = utcnow().date()
    # contatado há 40 dias (> janela 30), última compra continua antiga
    _profile(db, cid, "exp_001", last_purchase=today - timedelta(days=60), total=1000.0)
    _attribution(db, cid, "exp_001", contacted_days_ago=40,
                 snap_last=today - timedelta(days=60), snap_revenue=1000.0)

    resolve_attributions(db, cid)
    attr = db.query(OutreachAttribution).filter_by(company_id=cid, customer_hash="exp_001").first()
    assert attr.status == "expired"


def test_compra_anterior_ao_contato_nao_conta(db, company_a):
    cid = company_a["company"].id
    today = utcnow().date()
    # última compra é ANTERIOR ao contato (não é recuperação) e dentro da janela → fica pending
    _profile(db, cid, "noc_001", last_purchase=today - timedelta(days=20), total=1200.0)
    _attribution(db, cid, "noc_001", contacted_days_ago=10,
                 snap_last=today - timedelta(days=20), snap_revenue=1200.0)

    resolve_attributions(db, cid)
    attr = db.query(OutreachAttribution).filter_by(company_id=cid, customer_hash="noc_001").first()
    assert attr.status == "pending"  # nem recuperou nem expirou ainda


def test_endpoint_recovery_agrega_total(client, db, company_a):
    cid = company_a["company"].id
    db.add(OutreachAttribution(
        company_id=cid, customer_hash="end_001", customer_name="Cli End",
        channel="email", contacted_at=utcnow() - timedelta(days=5),
        status="recovered", recovered_value=750.0, resolved_at=utcnow(),
    ))
    db.commit()
    r = client.get("/api/outreach/recovery", cookies=company_a["cookie"])
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["totalRecovered"] >= 750.0
    assert data["recoveredCount"] >= 1
