# app/domain/models.py
from sqlalchemy import Boolean, Column, String, Float, Integer, JSON, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import declarative_base
from datetime import datetime
import uuid

Base = declarative_base()


class Company(Base):
    __tablename__ = "companies"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    cnpj = Column(String, nullable=True)
    plan = Column(String, default="free")
    uploads_limit = Column(Integer, default=5)
    uploads_used = Column(Integer, default=0)
    stripe_customer_id = Column(String, nullable=True, index=True)
    stripe_subscription_id = Column(String, nullable=True)
    plan_updated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="admin")  # admin, analyst, viewer
    status = Column(String, default="active")
    company_id = Column(String, ForeignKey("companies.id"), index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String, ForeignKey("companies.id"), index=True, nullable=False)
    filename = Column(String, nullable=False)
    status = Column(String, default="pending", index=True)
    error_message = Column(String, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        # A listagem do histórico filtra por company e ordena por data — índice composto cobre os dois.
        Index("ix_uploaded_files_company_uploaded_at", "company_id", "uploaded_at"),
    )


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    file_id = Column(String, ForeignKey("uploaded_files.id"), unique=True)
    company_id = Column(String, ForeignKey("companies.id"), index=True, nullable=False)
    total_revenue = Column(Float, default=0.0)
    lost_revenue = Column(Float, default=0.0)
    opportunities_count = Column(Integer, default=0)
    active_customers = Column(Integer, default=0)
    analyzed_products = Column(Integer, default=0)
    charts = Column(JSON, default=dict)
    top_opportunities = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)


class ComputedInsights(Base):
    """
    Pre-computed insights per company per date range.
    Replaced on every new upload — no raw transaction data stored.
    """
    __tablename__ = "computed_insights"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String, ForeignKey("companies.id"), nullable=False, index=True)
    date_range = Column(String, nullable=False)  # "1m" | "3m" | "6m" | "12m"
    summary = Column(JSON, default=dict)
    opportunities = Column(JSON, default=list)
    charts = Column(JSON, default=dict)
    computed_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("company_id", "date_range", name="uq_computed_insights_company_range"),
        # Lookups filtram sempre por (company_id, date_range) — índice composto resolve.
        Index("ix_computed_insights_company_range", "company_id", "date_range"),
    )


class CustomerProfile(Base):
    """
    Aggregated per-customer metrics. Replaced on every new upload.
    Stores RFV scores, top products and monthly revenue — no individual transactions.
    """
    __tablename__ = "customer_profiles"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String, ForeignKey("companies.id"), nullable=False, index=True)
    customer_hash = Column(String, nullable=False)
    customer_name = Column(String, nullable=False)
    total_revenue = Column(Float, default=0.0)
    percentage = Column(Float, default=0.0)
    last_purchase_date = Column(String, nullable=True)
    recency_days = Column(Integer, default=0)
    trend = Column(String, default="stable")
    segment = Column(String, default="new")
    rfv = Column(JSON, default=dict)
    top_products = Column(JSON, default=list)
    monthly_revenue = Column(JSON, default=list)
    alerts = Column(JSON, default=list)
    computed_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("company_id", "customer_hash", name="uq_customer_profile_company_hash"),
    )


class ApiKey(Base):
    """Ingest API keys per company. Stores SHA-256 hash — never the plaintext."""
    __tablename__ = "api_keys"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String, ForeignKey("companies.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    key_hash = Column(String, nullable=False, unique=True)
    prefix = Column(String, nullable=False)  # first 16 chars for display
    is_active = Column(Boolean, default=True, nullable=False)
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class NotificationPreference(Base):
    """Per-user notification settings for daily digest (email + WhatsApp)."""
    __tablename__ = "notification_preferences"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, unique=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False, index=True)
    enabled = Column(Boolean, default=True, nullable=False)
    email_enabled = Column(Boolean, default=True, nullable=False)
    whatsapp_enabled = Column(Boolean, default=False, nullable=False)
    whatsapp_phone = Column(String, nullable=True)
    send_hour = Column(Integer, default=8)   # hour in BRT (0-23)
    min_opportunity_value = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OpportunityAction(Base):
    """Commercial action taken by a vendor on an opportunity (Carteira Ativa)."""
    __tablename__ = "opportunity_actions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String, ForeignKey("companies.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    opportunity_id = Column(String, nullable=False)  # customer_hash from ComputedInsights
    customer_name = Column(String, nullable=True)
    expected_value = Column(Float, default=0.0)
    status = Column(String, default="to_contact")  # to_contact | contacted | won | lost
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("company_id", "user_id", "opportunity_id", name="uq_opportunity_action"),
        Index("ix_opportunity_actions_company_status", "company_id", "status"),
    )
