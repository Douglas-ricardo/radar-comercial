"""
Harness de testes — banco SQLite isolado (não toca no banco real do dev).

Detalhe importante: o engine do projeto usa pool_size=1 para SQLite. Por isso os
testes usam UMA sessão compartilhada entre o setup (fixtures) e as requisições do
TestClient, via dependency_overrides — caso contrário a sessão do fixture seguraria
a única conexão do pool e a requisição daria TimeoutError.
"""
import os
import uuid

from dotenv import load_dotenv

load_dotenv()  # carrega SECRET_KEY etc. do .env
_TEST_DB = "./test_radar_qa.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ.setdefault("SECRET_KEY", "test-secret-key-please-only-for-tests-0123456789")

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.infrastructure.database import SessionLocal, engine, get_db_session
from app.domain.models import Base, Company, User, CustomerProfile
from app.core.security import get_password_hash, create_access_token

# Sessão única compartilhada por toda a sessão de testes (cabe no pool_size=1).
_shared_session = SessionLocal()


def _override_get_db():
    # Não fecha a sessão — ela é compartilhada com os fixtures durante o teste.
    yield _shared_session


app.dependency_overrides[get_db_session] = _override_get_db


@pytest.fixture(scope="session", autouse=True)
def _setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    _shared_session.close()
    Base.metadata.drop_all(bind=engine)
    if os.path.exists(_TEST_DB):
        os.remove(_TEST_DB)


@pytest.fixture
def db():
    return _shared_session


def _make_company_with_admin(db, name: str, plan: str = "pro", uploads_used: int = 0):
    company = Company(
        id=str(uuid.uuid4()), name=name, plan=plan,
        uploads_limit=50 if plan == "pro" else 5, uploads_used=uploads_used,
    )
    db.add(company)
    admin = User(
        id=str(uuid.uuid4()), name=f"Admin {name}",
        email=f"admin_{uuid.uuid4().hex[:8]}@test.com",
        hashed_password=get_password_hash("Teste123"),
        role="admin", status="active", company_id=company.id, credential_version=0,
    )
    db.add(admin)
    db.commit()
    return company, admin


def _cookie(user: User) -> dict:
    token = create_access_token({
        "sub": user.id, "company_id": user.company_id,
        "role": user.role, "cv": user.credential_version or 0,
    })
    return {"radar_session": token}


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def company_a(db):
    company, admin = _make_company_with_admin(db, "Empresa A")
    db.add(CustomerProfile(
        company_id=company.id, customer_hash="hash_a_001", customer_name="Cliente A1",
        segment="at_risk", recency_days=70, total_revenue=1000.0, phone="+5511999990001",
    ))
    db.commit()
    return {"company": company, "admin": admin, "cookie": _cookie(admin), "customer_hash": "hash_a_001"}


@pytest.fixture
def company_b(db):
    company, admin = _make_company_with_admin(db, "Empresa B")
    return {"company": company, "admin": admin, "cookie": _cookie(admin)}


@pytest.fixture
def viewer_b(db, company_b):
    viewer = User(
        id=str(uuid.uuid4()), name="Viewer B",
        email=f"viewer_{uuid.uuid4().hex[:8]}@test.com",
        hashed_password=get_password_hash("Teste123"),
        role="viewer", status="active",
        company_id=company_b["company"].id, credential_version=0,
    )
    db.add(viewer)
    db.commit()
    return {"user": viewer, "cookie": _cookie(viewer)}


@pytest.fixture
def analyst_a(db, company_a):
    analyst = User(
        id=str(uuid.uuid4()), name="Analyst A",
        email=f"analyst_{uuid.uuid4().hex[:8]}@test.com",
        hashed_password=get_password_hash("Teste123"),
        role="analyst", status="active",
        company_id=company_a["company"].id, credential_version=0,
    )
    db.add(analyst)
    db.commit()
    return {"user": analyst, "cookie": _cookie(analyst), "company": company_a["company"]}


@pytest.fixture
def pending_user_a(db, company_a):
    """Usuário convidado com senha temporária (status=pending)."""
    pending = User(
        id=str(uuid.uuid4()), name="Convidado A",
        email=f"pending_{uuid.uuid4().hex[:8]}@test.com",
        hashed_password=get_password_hash("Teste123"),
        role="analyst", status="pending",
        company_id=company_a["company"].id, credential_version=0,
    )
    db.add(pending)
    db.commit()
    return {"user": pending, "cookie": _cookie(pending)}
