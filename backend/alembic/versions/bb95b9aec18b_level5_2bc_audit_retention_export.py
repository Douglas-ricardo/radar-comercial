"""level5.2bc-audit-retention-export

Revision ID: bb95b9aec18b
Revises: 887182a95310
Create Date: 2026-06-23 18:14:43.537692

Idempotente. audit_retention_days NOT NULL com server_default p/ linhas existentes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'bb95b9aec18b'
down_revision: Union[str, None] = '887182a95310'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(insp, table: str, col: str) -> bool:
    return any(c["name"] == col for c in insp.get_columns(table))


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not _has_column(insp, "audit_logs", "ip"):
        op.add_column("audit_logs", sa.Column("ip", sa.String(), nullable=True))
    if not _has_column(insp, "audit_logs", "user_agent"):
        op.add_column("audit_logs", sa.Column("user_agent", sa.String(), nullable=True))
    if not _has_column(insp, "companies", "audit_retention_days"):
        op.add_column("companies", sa.Column("audit_retention_days", sa.Integer(), server_default="365", nullable=False))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if _has_column(insp, "companies", "audit_retention_days"):
        op.drop_column("companies", "audit_retention_days")
    if _has_column(insp, "audit_logs", "user_agent"):
        op.drop_column("audit_logs", "user_agent")
    if _has_column(insp, "audit_logs", "ip"):
        op.drop_column("audit_logs", "ip")
