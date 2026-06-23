"""level5.3-crm-savedviews-currency

Revision ID: 52b014d3bd9f
Revises: bb95b9aec18b
Create Date: 2026-06-23 18:29:35.069185

Idempotente. Cria crm_connections/saved_views e companies.currency se ausentes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '52b014d3bd9f'
down_revision: Union[str, None] = 'bb95b9aec18b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(insp, name: str) -> bool:
    return name in insp.get_table_names()


def _has_column(insp, table: str, col: str) -> bool:
    return any(c["name"] == col for c in insp.get_columns(table))


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not _has_column(insp, "companies", "currency"):
        op.add_column("companies", sa.Column("currency", sa.String(), server_default="BRL", nullable=False))

    if not _has_table(insp, "crm_connections"):
        op.create_table(
            "crm_connections",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("provider", sa.String(), nullable=False),
            sa.Column("credentials", sa.String(), nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("push_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("field_map", sa.JSON(), nullable=True),
            sa.Column("last_sync_at", sa.DateTime(), nullable=True),
            sa.Column("last_sync_status", sa.String(), nullable=True),
            sa.Column("last_sync_error", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_crm_connections_company_id", "crm_connections", ["company_id"])

    if not _has_table(insp, "saved_views"):
        op.create_table(
            "saved_views",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("page", sa.String(), nullable=False),
            sa.Column("config", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_saved_views_company_id", "saved_views", ["company_id"])
        op.create_index("ix_saved_views_user_id", "saved_views", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if _has_table(insp, "saved_views"):
        op.drop_table("saved_views")
    if _has_table(insp, "crm_connections"):
        op.drop_table("crm_connections")
    if _has_column(insp, "companies", "currency"):
        op.drop_column("companies", "currency")
