"""
P2 — captura de respostas via webhook do Evolution + opt-out automático por "PARE".
"""
from app.core.webhook_sign import make_webhook_token, verify_webhook_token
from app.domain.models import ContactOptOut, OutreachLog
from app.services.outreach_service import is_stop_message


def _msg_payload(remote_jid: str, text: str, from_me: bool = False) -> dict:
    return {
        "event": "messages.upsert",
        "data": {
            "key": {"remoteJid": remote_jid, "fromMe": from_me},
            "message": {"conversation": text},
            "pushName": "Cliente Teste",
        },
    }


# ── unit: detecção de STOP ────────────────────────────────────────────────────

def test_is_stop_message():
    assert is_stop_message("PARE") is True
    assert is_stop_message("parar") is True
    assert is_stop_message("Quero sair dessa lista") is False  # "sair" não no início
    assert is_stop_message("SAIR") is True
    assert is_stop_message("Oi, tenho interesse!") is False
    assert is_stop_message("") is False


# ── token do webhook ──────────────────────────────────────────────────────────

def test_webhook_token_roundtrip():
    t = make_webhook_token("cid-xyz")
    assert verify_webhook_token(t) == "cid-xyz"


def test_webhook_token_invalido():
    assert verify_webhook_token("xxx.yyy.zzz") is None


# ── endpoint webhook ──────────────────────────────────────────────────────────

def test_webhook_token_invalido_nao_processa(client):
    r = client.post("/api/outreach/webhook/evolution?token=lixo", json=_msg_payload("5511999990001@s.whatsapp.net", "oi"))
    assert r.status_code == 200
    assert r.json()["success"] is False


def test_webhook_resposta_normal_loga(client, db, company_a):
    cid = company_a["company"].id
    token = make_webhook_token(cid)
    # company_a tem um perfil com phone +5511999990001
    r = client.post(
        f"/api/outreach/webhook/evolution?token={token}",
        json=_msg_payload("5511999990001@s.whatsapp.net", "Tenho interesse sim!"),
    )
    assert r.status_code == 200 and r.json()["success"] is True
    log = db.query(OutreachLog).filter_by(company_id=cid, channel="whatsapp_in").first()
    assert log is not None


def test_webhook_pare_opta_out(client, db, company_a):
    cid = company_a["company"].id
    chash = company_a["customer_hash"]
    token = make_webhook_token(cid)
    r = client.post(
        f"/api/outreach/webhook/evolution?token={token}",
        json=_msg_payload("5511999990001@s.whatsapp.net", "PARE"),
    )
    assert r.status_code == 200
    optout = db.query(ContactOptOut).filter_by(company_id=cid, customer_hash=chash).first()
    assert optout is not None and optout.source == "reply_stop"


def test_webhook_ignora_from_me(client, db, company_a):
    cid = company_a["company"].id
    token = make_webhook_token(cid)
    before = db.query(OutreachLog).filter_by(company_id=cid, channel="whatsapp_in").count()
    r = client.post(
        f"/api/outreach/webhook/evolution?token={token}",
        json=_msg_payload("5511999990001@s.whatsapp.net", "msg nossa", from_me=True),
    )
    assert r.status_code == 200
    after = db.query(OutreachLog).filter_by(company_id=cid, channel="whatsapp_in").count()
    assert after == before  # não loga mensagem enviada por nós
