"""
Regressão das correções de segurança da auditoria 2026-06.
Garante que os furos fechados não reabram.
"""
import hashlib
import uuid

from app.domain.models import ApiKey, Company


def test_viewer_nao_pode_fazer_upload(client, viewer_b):
    """#2 — viewer não tem permissão de upload (403 antes de processar o arquivo)."""
    r = client.post(
        "/api/files/upload",
        files={"file": ("vendas.csv", b"data,cliente,valor\n01/01/2024,X,100", "text/csv")},
        cookies=viewer_b["cookie"],
    )
    assert r.status_code == 403


def test_ingest_sem_api_key_401(client):
    """Ingestão sem X-API-Key → 401."""
    r = client.post("/api/data/ingest", json={"records": [{"data": "01/01/2024", "cliente": "X", "valor": 100}]})
    assert r.status_code == 401


def test_ingest_respeita_cota_de_plano(client, db, company_b):
    """#1 — ingestão por API Key não pode furar a cota do plano (403 quando estourada)."""
    company = company_b["company"]
    # cria uma API key válida para a empresa B
    plain = f"rc_live_{uuid.uuid4().hex}"
    db.add(ApiKey(
        company_id=company.id, name="key-teste",
        key_hash=hashlib.sha256(plain.encode()).hexdigest(), prefix=plain[:16],
    ))
    # estoura a cota
    c = db.query(Company).filter_by(id=company.id).first()
    c.uploads_used = c.uploads_limit
    db.commit()

    r = client.post(
        "/api/data/ingest",
        json={"records": [{"data": "01/01/2024", "cliente": "X", "produto": "P", "quantidade": 1, "valor": 100}]},
        headers={"X-API-Key": plain},
    )
    assert r.status_code == 403


def test_ingest_api_key_invalida_401(client):
    """API Key inexistente → 401."""
    r = client.post(
        "/api/data/ingest",
        json={"records": [{"data": "01/01/2024", "cliente": "X", "valor": 100}]},
        headers={"X-API-Key": "rc_live_chave_que_nao_existe"},
    )
    assert r.status_code == 401


def test_security_headers_presentes(client):
    """#10 — headers de segurança em toda resposta."""
    r = client.get("/health")
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert r.headers.get("X-Frame-Options") == "DENY"
    assert "Referrer-Policy" in r.headers


def test_whatsapp_connect_exige_admin(client, viewer_b):
    """#8 — viewer não pode conectar WhatsApp (admin only)."""
    r = client.post("/api/outreach/whatsapp/connect", cookies=viewer_b["cookie"])
    assert r.status_code == 403
