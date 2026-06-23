# app/domain/models.py
from sqlalchemy import Boolean, Column, String, Float, Integer, JSON, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import declarative_base
from datetime import datetime
from app.core.clock import utcnow
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
    # ID do usuário fundador (primeiro admin). Honra o contrato do frontend (types/index.ts).
    owner_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="admin")  # admin, analyst, viewer
    status = Column(String, default="active")
    company_id = Column(String, ForeignKey("companies.id"), index=True)
    # Incrementado em troca/reset de senha → invalida JWTs emitidos antes.
    credential_version = Column(Integer, default=0, nullable=False)
    # Escopo territorial opcional: "branch:SP-001" filtra visibilidade de carteira/clientes.
    # None = sem restrição (admin vê tudo); preenchido pelo admin no convite.
    scope = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String, ForeignKey("companies.id"), index=True, nullable=False)
    filename = Column(String, nullable=False)
    status = Column(String, default="pending", index=True)
    error_message = Column(String, nullable=True)
    uploaded_at = Column(DateTime, default=utcnow)
    # Referência ao arquivo de origem (path local ou r2://key). Só serve para
    # reprocessar quando RETAIN_SOURCE_FILES=true; senão o arquivo é apagado
    # após o ETL (padrão LGPD: não reter transação bruta).
    source_ref = Column(String, nullable=True)

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
    created_at = Column(DateTime, default=utcnow)


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
    computed_at = Column(DateTime, default=utcnow)

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
    # Contato do cliente final (PII) — usado para disparo WhatsApp/email.
    # Preenchido pelo upload (colunas telefone/email) ou cadastro manual.
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    contact_opt_out = Column(Boolean, default=False, nullable=False)  # excluído do auto-envio
    # Campos opcionais de segmentação — extraídos do CSV quando presentes.
    document_id = Column(String, nullable=True)   # CNPJ/CPF sem formatação
    branch = Column(String, nullable=True)         # filial/unidade/loja do CSV
    salesperson = Column(String, nullable=True)    # vendedor responsável do CSV
    total_revenue = Column(Float, default=0.0)
    percentage = Column(Float, default=0.0)
    last_purchase_date = Column(String, nullable=True)
    recency_days = Column(Integer, default=0)
    # Churn preditivo (ml/churn.py): cadência de compra + risco de sumir
    avg_interval_days = Column(Float, default=0.0)
    churn_risk = Column(String, default="none")   # none | low | medium | high
    churn_score = Column(Integer, default=0)       # 0–100
    trend = Column(String, default="stable")
    segment = Column(String, default="new")
    rfv = Column(JSON, default=dict)
    top_products = Column(JSON, default=list)
    monthly_revenue = Column(JSON, default=list)
    alerts = Column(JSON, default=list)
    computed_at = Column(DateTime, default=utcnow)

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
    created_at = Column(DateTime, default=utcnow)


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
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class IntegrationConfig(Base):
    """
    Sync configuration per company for automatic data ingestion.
    type: "google_sheets" (future: "omie", "bling", etc.)
    config: JSON with connector-specific settings (sheet_url, sheet_name, etc.)
    """
    __tablename__ = "integration_configs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String, ForeignKey("companies.id"), nullable=False, index=True)
    type = Column(String, nullable=False)  # "google_sheets"
    config = Column(JSON, default=dict)    # { sheet_url, sheet_name, header_row }
    enabled = Column(Boolean, default=True, nullable=False)
    last_sync_at = Column(DateTime, nullable=True)
    last_sync_status = Column(String, nullable=True)  # "ok" | "error"
    last_sync_error = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        UniqueConstraint("company_id", "type", name="uq_integration_config_company_type"),
    )


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
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        UniqueConstraint("company_id", "user_id", "opportunity_id", name="uq_opportunity_action"),
        Index("ix_opportunity_actions_company_status", "company_id", "status"),
    )


class OutreachConfig(Base):
    """
    Configuração de disparo automático para o cliente final, por empresa.
    Canais: WhatsApp (Evolution API, número do vendedor) + Email (Resend).
    """
    __tablename__ = "outreach_configs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String, ForeignKey("companies.id"), nullable=False, unique=True, index=True)

    # Master + canais
    auto_send_enabled = Column(Boolean, default=False, nullable=False)
    whatsapp_enabled = Column(Boolean, default=True, nullable=False)
    email_enabled = Column(Boolean, default=False, nullable=False)

    # WhatsApp via Evolution (instância = company_id)
    evolution_instance = Column(String, nullable=True)
    whatsapp_status = Column(String, default="disconnected")  # disconnected | connecting | connected
    whatsapp_number = Column(String, nullable=True)           # número do vendedor conectado

    # Assinatura / remetente (email formal)
    sender_name = Column(String, nullable=True)               # nome do vendedor/empresa na assinatura
    reply_to_email = Column(String, nullable=True)            # email do vendedor p/ resposta

    # Regras de disparo (anti-ban + segmentação)
    send_hour = Column(Integer, default=9)                    # hora BRT
    min_opportunity_value = Column(Float, default=0.0)
    daily_limit = Column(Integer, default=30)                 # teto de mensagens/dia
    cadence_enabled = Column(Boolean, default=False, nullable=False)  # sequência multi-toque

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class ContactOptOut(Base):
    """
    Opt-out DURÁVEL do cliente final (LGPD). Fonte de verdade do descadastro —
    sobrevive ao rebuild de CustomerProfile (apagado a cada upload). Consultado
    no rebuild e no disparo. Origem: manual, resposta "PARE" ou link no email.
    """
    __tablename__ = "contact_opt_outs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String, ForeignKey("companies.id"), nullable=False, index=True)
    customer_hash = Column(String, nullable=False, index=True)
    source = Column(String, default="manual")  # manual | reply_stop | email_unsubscribe
    created_at = Column(DateTime, default=utcnow)

    __table_args__ = (
        UniqueConstraint("company_id", "customer_hash", name="uq_contact_opt_out"),
    )


class OutreachLog(Base):
    """
    Registro de cada mensagem enviada ao cliente final. Base para dedup
    ("já enviei hoje?"), métricas e auditoria. Não guarda o texto completo por
    padrão — apenas metadados (LGPD).
    """
    __tablename__ = "outreach_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String, ForeignKey("companies.id"), nullable=False, index=True)
    customer_hash = Column(String, nullable=False)
    customer_name = Column(String, nullable=True)
    channel = Column(String, nullable=False)                  # whatsapp | email
    status = Column(String, default="sent")                   # sent | failed | skipped
    error = Column(String, nullable=True)
    sent_at = Column(DateTime, default=utcnow, index=True)

    __table_args__ = (
        Index("ix_outreach_logs_company_customer", "company_id", "customer_hash"),
    )


class CadenceEnrollment(Base):
    """
    Inscrição de um cliente numa cadência multi-toque (sequência de mensagens
    espaçadas). O motor (process_cadence_steps) avança passo a passo, agendado
    via next_run_at — sem `time.sleep` bloqueante. Para quando o cliente responde,
    compra (recovered) ou opta por sair.
    """
    __tablename__ = "cadence_enrollments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String, ForeignKey("companies.id"), nullable=False, index=True)
    customer_hash = Column(String, nullable=False, index=True)
    customer_name = Column(String, nullable=True)
    step_index = Column(Integer, default=0)                    # próximo passo a enviar
    status = Column(String, default="active", index=True)      # active | completed | stopped
    stop_reason = Column(String, nullable=True)                # replied | recovered | opted_out | manual
    enrolled_at = Column(DateTime, default=utcnow)
    next_run_at = Column(DateTime, default=utcnow, index=True) # quando o próximo passo vence
    last_step_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_cadence_company_status_next", "company_id", "status", "next_run_at"),
    )


class OutreachAttribution(Base):
    """
    Loop fechado de receita recuperada. No momento do disparo, tira um snapshot
    do estado do cliente (última compra + receita total). No próximo upload, se o
    cliente voltou a comprar (última compra avançou para depois do contato), a
    recuperação é atribuída — funciona só com agregados, sem transações brutas.

    status: pending → recovered (cliente voltou) | expired (passou a janela sem compra).
    recovered_value = nova_receita_total − revenue_at_contact (delta positivo).
    """
    __tablename__ = "outreach_attributions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String, ForeignKey("companies.id"), nullable=False, index=True)
    customer_hash = Column(String, nullable=False, index=True)
    customer_name = Column(String, nullable=True)
    channel = Column(String, nullable=True)               # whatsapp | email | both
    contacted_at = Column(DateTime, default=utcnow)
    # Snapshot no momento do contato (estado "churned")
    last_purchase_at_contact = Column(String, nullable=True)   # ISO date ou None
    revenue_at_contact = Column(Float, default=0.0)
    # Resolução
    status = Column(String, default="pending", index=True)     # pending | recovered | expired
    recovered_value = Column(Float, nullable=True)
    resolved_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_outreach_attr_company_status", "company_id", "status"),
    )
