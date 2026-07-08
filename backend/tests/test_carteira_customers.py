"""
Carteira — base COMPLETA de clientes (GET /carteira/{id}/customers): mostra TODOS
os perfis (inclusive ativos, que não entram no funil de oportunidades) com filtros
de análise/controle.
"""
from app.domain.models import CustomerProfile, OpportunityAction


def _seed(db, cid):
    profs = [
        dict(customer_hash="c_active", customer_name="Ativo Campeao", segment="champion",
             status="active", recency_days=5, total_revenue=9000.0, expected_value=800.0,
             recovery_score=90, recovery_band="alta", phone="+5511900000001"),
        dict(customer_hash="c_risk", customer_name="Em Risco Ltda", segment="at_risk",
             status="at_risk", recency_days=60, total_revenue=3000.0, expected_value=400.0,
             recovery_score=55, recovery_band="media", email="risco@x.com"),
        dict(customer_hash="c_lost", customer_name="Perdido SA", segment="lost",
             status="churned", recency_days=200, total_revenue=1000.0, expected_value=150.0,
             recovery_score=20, recovery_band="baixa"),  # sem contato
    ]
    for p in profs:
        db.add(CustomerProfile(company_id=cid, **p))
    db.commit()


def test_lista_todos_inclui_ativos(client, company_a, db):
    cid = company_a["company"].id
    _seed(db, cid)
    r = client.get(f"/api/carteira/{cid}/customers", cookies=company_a["cookie"])
    assert r.status_code == 200
    names = {o["customer"] for o in r.json()["data"]}
    # o ativo (que NUNCA aparece no funil de oportunidades) está aqui
    assert "Ativo Campeao" in names
    assert {"Em Risco Ltda", "Perdido SA"} <= names


def test_filtro_por_status_e_segmento(client, company_a, db):
    cid = company_a["company"].id
    _seed(db, cid)
    r = client.get(f"/api/carteira/{cid}/customers?status=active", cookies=company_a["cookie"])
    assert {o["customer"] for o in r.json()["data"]} == {"Ativo Campeao"}

    r = client.get(f"/api/carteira/{cid}/customers?segment=lost", cookies=company_a["cookie"])
    assert {o["customer"] for o in r.json()["data"]} == {"Perdido SA"}


def test_filtro_busca_e_contato(client, company_a, db):
    cid = company_a["company"].id
    _seed(db, cid)
    r = client.get(f"/api/carteira/{cid}/customers?search=risco", cookies=company_a["cookie"])
    assert {o["customer"] for o in r.json()["data"]} == {"Em Risco Ltda"}

    r = client.get(f"/api/carteira/{cid}/customers?has_contact=true", cookies=company_a["cookie"])
    names = {o["customer"] for o in r.json()["data"]}
    assert "Perdido SA" not in names  # sem phone/email
    assert {"Ativo Campeao", "Em Risco Ltda"} <= names


def test_filtro_por_status_da_acao(client, company_a, db):
    cid = company_a["company"].id
    _seed(db, cid)
    db.add(OpportunityAction(
        company_id=cid, user_id=company_a["admin"].id,
        opportunity_id="c_risk", customer_name="Em Risco Ltda",
        expected_value=400.0, status="won",
    ))
    db.commit()
    r = client.get(f"/api/carteira/{cid}/customers?action_status=won", cookies=company_a["cookie"])
    data = r.json()["data"]
    assert [o["customer"] for o in data] == ["Em Risco Ltda"]
    assert data[0]["action"]["status"] == "won"
