"""persist single-source fields on customer_profiles

Revision ID: a1b2c3d4e5f6
Revises: 21d617ae15d7
Create Date: 2026-06-26 00:00:00.000000

Persiste a fonte única (classify_customer_status / recovery_score) no CustomerProfile:
status, expected_value, recovery_score, recovery_band, priority_value. Elimina o
recálculo ad-hoc (P0 #1/#2, P1 #6 do QA backend).

Idempotente: convive com create_all/_ensure_columns. Cada coluna só é adicionada se
ainda não existir.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '21d617ae15d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(insp, table: str, col: str) -> bool:
    return any(c["name"] == col for c in insp.get_columns(table))


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if "customer_profiles" not in insp.get_table_names():
        return

    if not _has_column(insp, "customer_profiles", "status"):
        op.add_column("customer_profiles", sa.Column("status", sa.String(), nullable=True))
    if not _has_column(insp, "customer_profiles", "expected_value"):
        op.add_column("customer_profiles", sa.Column("expected_value", sa.Float(), server_default="0", nullable=True))
    if not _has_column(insp, "customer_profiles", "recovery_score"):
        op.add_column("customer_profiles", sa.Column("recovery_score", sa.Integer(), server_default="0", nullable=True))
    if not _has_column(insp, "customer_profiles", "recovery_band"):
        op.add_column("customer_profiles", sa.Column("recovery_band", sa.String(), nullable=True))
    if not _has_column(insp, "customer_profiles", "priority_value"):
        op.add_column("customer_profiles", sa.Column("priority_value", sa.Float(), server_default="0", nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if "customer_profiles" not in insp.get_table_names():
        return

    for col in ("priority_value", "recovery_band", "recovery_score", "expected_value", "status"):
        if _has_column(insp, "customer_profiles", col):
            op.drop_column("customer_profiles", col)
