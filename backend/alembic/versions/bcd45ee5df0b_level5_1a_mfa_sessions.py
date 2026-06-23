"""level5.1a-mfa-sessions

Revision ID: bcd45ee5df0b
Revises: f039b3f231ed
Create Date: 2026-06-23 17:24:22.332411

Idempotente: convive com create_all/_ensure_columns (hybrid). Cada objeto só é
criado se ainda não existir, evitando conflito quando o app já subiu antes da migração.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bcd45ee5df0b'
down_revision: Union[str, None] = 'f039b3f231ed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(insp, name: str) -> bool:
    return name in insp.get_table_names()


def _has_column(insp, table: str, col: str) -> bool:
    return any(c["name"] == col for c in insp.get_columns(table))


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not _has_column(insp, "companies", "ip_allowlist"):
        op.add_column("companies", sa.Column("ip_allowlist", sa.JSON(), nullable=True))

    if not _has_column(insp, "users", "mfa_enabled"):
        op.add_column("users", sa.Column("mfa_enabled", sa.Boolean(), server_default=sa.false(), nullable=False))
    if not _has_column(insp, "users", "mfa_secret"):
        op.add_column("users", sa.Column("mfa_secret", sa.String(), nullable=True))
    if not _has_column(insp, "users", "mfa_backup_codes"):
        op.add_column("users", sa.Column("mfa_backup_codes", sa.JSON(), nullable=True))

    if not _has_table(insp, "user_sessions"):
        op.create_table(
            "user_sessions",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("ip", sa.String(), nullable=True),
            sa.Column("user_agent", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("last_seen_at", sa.DateTime(), nullable=True),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
        op.create_index("ix_user_sessions_company_id", "user_sessions", ["company_id"])
        op.create_index("ix_user_sessions_user_revoked", "user_sessions", ["user_id", "revoked_at"])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if _has_table(insp, "user_sessions"):
        op.drop_index("ix_user_sessions_user_revoked", table_name="user_sessions")
        op.drop_index("ix_user_sessions_company_id", table_name="user_sessions")
        op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
        op.drop_table("user_sessions")
    if _has_column(insp, "users", "mfa_backup_codes"):
        op.drop_column("users", "mfa_backup_codes")
    if _has_column(insp, "users", "mfa_secret"):
        op.drop_column("users", "mfa_secret")
    if _has_column(insp, "users", "mfa_enabled"):
        op.drop_column("users", "mfa_enabled")
    if _has_column(insp, "companies", "ip_allowlist"):
        op.drop_column("companies", "ip_allowlist")
