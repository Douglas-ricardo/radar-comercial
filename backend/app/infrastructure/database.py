# app/infrastructure/database.py
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.domain.models import Base
from dotenv import load_dotenv

load_dotenv()

# Vai buscar a URL do .env. Se não existir, usa o SQLite local
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./radar_comercial.db")

# Corrige o prefixo para o SQLAlchemy 1.4+ (necessário para Neon/Supabase)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# SQLite precisa de check_same_thread=False, PostgreSQL não.
is_sqlite = DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    # pool_pre_ping testa a conexão antes de usá-la — essencial para Neon/Supabase
    # que fecham conexões idle no lado do servidor.
    pool_pre_ping=True,
    # Recicla conexões após 5 min para evitar usar conexões já fechadas pelo servidor.
    pool_recycle=300,
    # SQLite não tem pool real; para PostgreSQL mantém até 10 conexões.
    pool_size=1 if is_sqlite else 10,
    max_overflow=0 if is_sqlite else 20,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Cria as tabelas
Base.metadata.create_all(bind=engine)


def _ensure_columns():
    """
    Migração leve e idempotente para colunas adicionadas após o create_all
    inicial. create_all não altera tabelas existentes — sem Alembic, garantimos
    aqui que colunas novas existam em bancos já provisionados.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    if "users" in tables:
        cols = {c["name"] for c in inspector.get_columns("users")}
        if "credential_version" not in cols:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE users ADD COLUMN credential_version INTEGER NOT NULL DEFAULT 0"
                ))

    if "customer_profiles" in tables:
        cols = {c["name"] for c in inspector.get_columns("customer_profiles")}
        with engine.begin() as conn:
            if "phone" not in cols:
                conn.execute(text("ALTER TABLE customer_profiles ADD COLUMN phone VARCHAR"))
            if "email" not in cols:
                conn.execute(text("ALTER TABLE customer_profiles ADD COLUMN email VARCHAR"))
            if "contact_opt_out" not in cols:
                conn.execute(text(
                    "ALTER TABLE customer_profiles ADD COLUMN contact_opt_out BOOLEAN NOT NULL DEFAULT FALSE"
                ))
            if "avg_interval_days" not in cols:
                conn.execute(text("ALTER TABLE customer_profiles ADD COLUMN avg_interval_days FLOAT DEFAULT 0"))
            if "churn_risk" not in cols:
                conn.execute(text("ALTER TABLE customer_profiles ADD COLUMN churn_risk VARCHAR DEFAULT 'none'"))
            if "churn_score" not in cols:
                conn.execute(text("ALTER TABLE customer_profiles ADD COLUMN churn_score INTEGER DEFAULT 0"))
            # Fonte única persistida (status comercial + recuperabilidade) — elimina recálculo ad-hoc.
            if "status" not in cols:
                conn.execute(text("ALTER TABLE customer_profiles ADD COLUMN status VARCHAR"))
            if "expected_value" not in cols:
                conn.execute(text("ALTER TABLE customer_profiles ADD COLUMN expected_value FLOAT DEFAULT 0"))
            if "recovery_score" not in cols:
                conn.execute(text("ALTER TABLE customer_profiles ADD COLUMN recovery_score INTEGER DEFAULT 0"))
            if "recovery_band" not in cols:
                conn.execute(text("ALTER TABLE customer_profiles ADD COLUMN recovery_band VARCHAR"))
            if "priority_value" not in cols:
                conn.execute(text("ALTER TABLE customer_profiles ADD COLUMN priority_value FLOAT DEFAULT 0"))

    if "uploaded_files" in tables:
        cols = {c["name"] for c in inspector.get_columns("uploaded_files")}
        if "source_ref" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE uploaded_files ADD COLUMN source_ref VARCHAR"))

    if "outreach_configs" in tables:
        cols = {c["name"] for c in inspector.get_columns("outreach_configs")}
        if "cadence_enabled" not in cols:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE outreach_configs ADD COLUMN cadence_enabled BOOLEAN NOT NULL DEFAULT FALSE"
                ))

    if "companies" in tables:
        cols = {c["name"] for c in inspector.get_columns("companies")}
        if "owner_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE companies ADD COLUMN owner_id VARCHAR"))
                # Backfill: owner = primeiro admin da empresa (por created_at).
                conn.execute(text(
                    "UPDATE companies SET owner_id = ("
                    " SELECT u.id FROM users u"
                    " WHERE u.company_id = companies.id AND u.role = 'admin'"
                    " ORDER BY u.created_at LIMIT 1"
                    ") WHERE owner_id IS NULL"
                ))


_ensure_columns()


def get_db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()