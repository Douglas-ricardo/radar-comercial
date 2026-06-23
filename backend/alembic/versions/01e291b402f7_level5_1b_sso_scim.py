"""level5.1b-sso-scim

Revision ID: 01e291b402f7
Revises: bcd45ee5df0b
Create Date: 2026-06-23 17:43:08.450168

Idempotente: convive com create_all (hybrid). Cada objeto só é criado se ausente.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '01e291b402f7'
down_revision: Union[str, None] = 'bcd45ee5df0b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(insp, name: str) -> bool:
    return name in insp.get_table_names()


def _has_column(insp, table: str, col: str) -> bool:
    return any(c["name"] == col for c in insp.get_columns(table))


def _has_index(insp, table: str, name: str) -> bool:
    return any(i["name"] == name for i in insp.get_indexes(table))


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not _has_column(insp, "companies", "sso_slug"):
        op.add_column("companies", sa.Column("sso_slug", sa.String(), nullable=True))
    if not _has_index(insp, "companies", "ix_companies_sso_slug"):
        op.create_index(op.f("ix_companies_sso_slug"), "companies", ["sso_slug"], unique=True)

    if not _has_table(insp, "sso_connections"):
        op.create_table(
            "sso_connections",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("protocol", sa.String(), nullable=False),
            sa.Column("display_name", sa.String(), nullable=True),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("default_role", sa.String(), nullable=True),
            sa.Column("allowed_domains", sa.JSON(), nullable=True),
            sa.Column("config", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_sso_connections_company_id", "sso_connections", ["company_id"])

    if not _has_table(insp, "scim_tokens"):
        op.create_table(
            "scim_tokens",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("token_hash", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("last_used_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_scim_tokens_company_id", "scim_tokens", ["company_id"])
        op.create_index("ix_scim_tokens_token_hash", "scim_tokens", ["token_hash"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if _has_table(insp, "scim_tokens"):
        op.drop_table("scim_tokens")
    if _has_table(insp, "sso_connections"):
        op.drop_table("sso_connections")
    if _has_index(insp, "companies", "ix_companies_sso_slug"):
        op.drop_index(op.f("ix_companies_sso_slug"), table_name="companies")
    if _has_column(insp, "companies", "sso_slug"):
        op.drop_column("companies", "sso_slug")
