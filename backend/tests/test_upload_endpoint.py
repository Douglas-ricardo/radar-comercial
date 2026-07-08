"""
Regressão do blocker de upload (FIX 1).

Antes desta correção, TODO upload retornava HTTP 500: o `logger.info` da rota
passava a chave reservada `filename` dentro de `extra={...}`, o que dispara
`KeyError` determinístico no LogRecord do Python. Os 79 testes anteriores nunca
exerciam o caminho REAL (signup → login → POST /files/upload) com um CSV válido,
então o bug passou batido. Este teste cobre exatamente esse caminho.
"""
import uuid


def _signup_and_login(client):
    """Cria uma empresa nova e autentica — devolve cookies de sessão reais."""
    email = f"upload_{uuid.uuid4().hex[:8]}@test.com"
    password = "Teste123"

    r = client.post(
        "/api/auth/signup",
        json={
            "name": "Dona do Upload",
            "email": email,
            "password": password,
            "companyName": f"Empresa Upload {uuid.uuid4().hex[:6]}",
        },
    )
    assert r.status_code == 200, r.text

    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    # TestClient persiste o cookie radar_session emitido no login.
    return client


def test_upload_csv_valido_retorna_200_e_file_id(client, monkeypatch):
    # Não dependemos do broker real: o enfileiramento é mockado.
    enqueued = {}

    def _fake_delay(file_id, company_id, file_ref, **kwargs):
        enqueued["file_id"] = file_id
        enqueued["company_id"] = company_id
        enqueued["file_ref"] = file_ref
        enqueued["kwargs"] = kwargs

    monkeypatch.setattr("app.api.files.process_sales_file.delay", _fake_delay)

    _signup_and_login(client)

    csv = b"data,cliente,produto,quantidade,valor\n01/01/2024,Cliente X,Produto Y,2,150.00\n"
    r = client.post(
        "/api/files/upload",
        files={"file": ("vendas.csv", csv, "text/csv")},
    )

    # O bug fazia isto retornar 500 para 100% dos uploads.
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert body["data"]["id"]  # file_id presente
    assert body["data"]["status"] == "processing"
    # E o worker foi de fato enfileirado com o mesmo file_id.
    assert enqueued.get("file_id") == body["data"]["id"]


def test_upload_estorna_cota_se_enfileiramento_falhar(client, db, monkeypatch):
    """
    Se algo falhar DEPOIS do débito de cota (broker fora, storage, etc.), o
    incremento de `uploads_used` precisa ser estornado e a resposta deve ser o
    JSON padrão {success:false}, nunca um 500 cru que queimaria a cota.
    """
    from app.domain.models import Company, User
    from app.core.security import create_access_token

    def _boom(*_a, **_k):
        raise RuntimeError("broker indisponível")

    monkeypatch.setattr("app.api.files.process_sales_file.delay", _boom)

    # empresa nova, cota zerada
    company = Company(
        id=str(uuid.uuid4()), name="Empresa Estorno", plan="pro",
        uploads_limit=50, uploads_used=0,
    )
    db.add(company)
    from app.core.security import get_password_hash
    admin = User(
        id=str(uuid.uuid4()), name="Admin Estorno",
        email=f"estorno_{uuid.uuid4().hex[:8]}@test.com",
        hashed_password=get_password_hash("Teste123"),
        role="admin", status="active", company_id=company.id, credential_version=0,
    )
    db.add(admin)
    db.commit()

    token = create_access_token({
        "sub": admin.id, "company_id": admin.company_id,
        "role": admin.role, "scope": admin.scope, "cv": 0,
    })

    csv = b"data,cliente,produto,quantidade,valor\n01/01/2024,Cliente X,Produto Y,2,150.00\n"
    r = client.post(
        "/api/files/upload",
        files={"file": ("vendas.csv", csv, "text/csv")},
        cookies={"radar_session": token},
    )

    assert r.status_code == 500
    body = r.json()
    assert body["success"] is False
    assert "error" in body

    # Cota estornada — o erro do servidor não pode debitar o usuário.
    db.refresh(company)
    assert company.uploads_used == 0
