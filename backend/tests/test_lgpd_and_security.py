"""
Cobertura das correções de robustez/LGPD da rodada "corrige tudo".
"""
from app.core.security import get_password_hash, verify_password
from app.core.unsubscribe import make_unsubscribe_token, verify_unsubscribe_token
from app.domain.models import ContactOptOut, CustomerProfile


# ── Segurança: bcrypt ─────────────────────────────────────────────────────────

def test_senha_muito_longa_nao_quebra():
    """Senha > 72 bytes não pode dar erro (bcrypt trunca de forma consistente)."""
    longa = "A1" + "x" * 200
    h = get_password_hash(longa)
    assert verify_password(longa, h) is True


def test_verify_hash_malformado_retorna_false():
    """Hash inválido → False, nunca exceção (sem 500 no login)."""
    assert verify_password("qualquer", "nao-eh-um-hash-bcrypt") is False


# ── LGPD: token de descadastro ────────────────────────────────────────────────

def test_unsubscribe_token_roundtrip():
    t = make_unsubscribe_token("cid-1", "hash-1")
    assert verify_unsubscribe_token(t) == ("cid-1", "hash-1")


def test_unsubscribe_token_invalido():
    assert verify_unsubscribe_token("token.invalido.qualquer") is None


# ── LGPD: endpoint público de descadastro ─────────────────────────────────────

def test_unsubscribe_endpoint_opta_out(client, db, company_a):
    """Cliente clica no link → opt-out durável gravado."""
    company_id = company_a["company"].id
    chash = company_a["customer_hash"]
    token = make_unsubscribe_token(company_id, chash)

    r = client.get(f"/api/outreach/unsubscribe?token={token}")
    assert r.status_code == 200
    assert "Descadastro confirmado" in r.text

    optout = db.query(ContactOptOut).filter_by(company_id=company_id, customer_hash=chash).first()
    assert optout is not None and optout.source == "email_unsubscribe"


def test_unsubscribe_endpoint_token_invalido_400(client):
    r = client.get("/api/outreach/unsubscribe?token=lixo")
    assert r.status_code == 400


# ── LGPD: eliminação de dados (erase) ─────────────────────────────────────────

def test_erase_contact_apaga_pii_e_opta_out(client, db, company_a):
    company_id = company_a["company"].id
    chash = company_a["customer_hash"]
    r = client.delete(f"/api/outreach/contacts/{chash}", cookies=company_a["cookie"])
    assert r.status_code == 200

    prof = db.query(CustomerProfile).filter_by(company_id=company_id, customer_hash=chash).first()
    assert prof.phone is None and prof.email is None and prof.contact_opt_out is True
    assert db.query(ContactOptOut).filter_by(company_id=company_id, customer_hash=chash).first() is not None


def test_erase_contact_exige_admin(client, viewer_b, company_b, db):
    """Viewer não pode apagar dados de contato."""
    # cria um perfil na empresa B
    db.add(CustomerProfile(
        company_id=company_b["company"].id, customer_hash="hash_b_x",
        customer_name="Cliente B", segment="lost", total_revenue=10.0,
    ))
    db.commit()
    r = client.delete("/api/outreach/contacts/hash_b_x", cookies=viewer_b["cookie"])
    assert r.status_code == 403
