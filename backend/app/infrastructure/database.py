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

def get_db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()