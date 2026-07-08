"""
Carteira "fora da base atual" (opção C): quando um re-upload substitui os perfis,
o cliente sai da base, MAS a ação comercial do vendedor (won/lost/notas) segue no
banco. A Carteira deve continuar exibindo essa ação como órfã (outOfBase=True) em
vez de sumir — senão o histórico comercial desaparece da tela.
"""
from app.domain.models import ComputedInsights, OpportunityAction


def _seed_insights(db, company_id):
    """Um cliente NA base atual (aparece nas oportunidades do período 1m)."""
    db.add(ComputedInsights(
        company_id=company_id,
        date_range="1m",
        summary={},
        charts={},
        opportunities=[{
            "id": "hash_in_base", "customerHash": "hash_in_base",
            "customer": "Cliente Em Base", "product": "X", "type": "missing_sale",
            "lastPurchase": None, "frequency": None, "expectedValue": 100.0,
            "confidence": "low", "daysInactive": 30,
        }],
    ))
    db.commit()


def test_acao_orfa_aparece_como_out_of_base(client, company_a, db):
    cid = company_a["company"].id
    _seed_insights(db, cid)
    # Ação num cliente que NÃO está mais na base (substituído por re-upload).
    db.add(OpportunityAction(
        company_id=cid, user_id=company_a["admin"].id,
        opportunity_id="hash_orphan", customer_name="Livraria Saber",
        expected_value=2915.25, status="won", notes="fechou pedido grande",
    ))
    db.commit()

    r = client.get(f"/api/carteira/{cid}", cookies=company_a["cookie"])
    assert r.status_code == 200
    data = r.json()["data"]
    by_customer = {o["customer"]: o for o in data}

    # o cliente em base aparece normal (não órfão)
    assert "Cliente Em Base" in by_customer
    assert not by_customer["Cliente Em Base"].get("outOfBase")

    # a ação órfã aparece preservada, marcada como fora da base
    assert "Livraria Saber" in by_customer, "ação órfã sumiu da Carteira!"
    orfa = by_customer["Livraria Saber"]
    assert orfa["outOfBase"] is True
    assert orfa["action"]["status"] == "won"
    assert orfa["action"]["notes"] == "fechou pedido grande"
    assert orfa["expectedValue"] == 2915.25


def test_filtro_status_respeita_orfas(client, company_a, db):
    cid = company_a["company"].id
    _seed_insights(db, cid)
    db.add(OpportunityAction(
        company_id=cid, user_id=company_a["admin"].id,
        opportunity_id="hash_orphan_lost", customer_name="Padaria Pao Quente",
        expected_value=500.0, status="lost",
    ))
    db.commit()

    # filtrando por won: a órfã 'lost' NÃO deve vir
    r = client.get(f"/api/carteira/{cid}?status=won", cookies=company_a["cookie"])
    names = {o["customer"] for o in r.json()["data"]}
    assert "Padaria Pao Quente" not in names

    # filtrando por lost: vem
    r = client.get(f"/api/carteira/{cid}?status=lost", cookies=company_a["cookie"])
    names = {o["customer"] for o in r.json()["data"]}
    assert "Padaria Pao Quente" in names
