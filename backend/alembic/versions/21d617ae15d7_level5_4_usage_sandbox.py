"""level5.4-usage-sandbox

Revision ID: 21d617ae15d7
Revises: 52b014d3bd9f
Create Date: 2026-06-23 23:14:27.723391

Idempotente. Cria usage_events e companies.is_sandbox se ausentes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '21d617ae15d7'
down_revision: Union[str, None] = '52b014d3bd9f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(insp, name: str) -> bool:
    return name in insp.get_table_names()


def _has_column(insp, table: str, col: str) -> bool:
    return any(c["name"] == col for c in insp.get_columns(table))


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not _has_column(insp, "companies", "is_sandbox"):
        op.add_column("companies", sa.Column("is_sandbox", sa.Boolean(), server_default=sa.false(), nullable=False))

    if not _has_table(insp, "usage_events"):
        op.create_table(
            "usage_events",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("kind", sa.String(), nullable=False),
            sa.Column("day", sa.String(), nullable=False),
            sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("company_id", "kind", "day", name="uq_usage_company_kind_day"),
        )
        op.create_index("ix_usage_events_company_id", "usage_events", ["company_id"])
        op.create_index("ix_usage_company_day", "usage_events", ["company_id", "day"])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if _has_table(insp, "usage_events"):
        op.drop_table("usage_events")
    if _has_column(insp, "companies", "is_sandbox"):
        op.drop_column("companies", "is_sandbox")
