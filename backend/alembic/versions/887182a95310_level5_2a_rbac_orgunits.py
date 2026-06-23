"""level5.2a-rbac-orgunits

Revision ID: 887182a95310
Revises: 01e291b402f7
Create Date: 2026-06-23 17:59:43.922340

Idempotente: convive com create_all (hybrid). Cria roles/org_units e as FKs em users
apenas se ausentes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '887182a95310'
down_revision: Union[str, None] = '01e291b402f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(insp, name: str) -> bool:
    return name in insp.get_table_names()


def _has_column(insp, table: str, col: str) -> bool:
    return any(c["name"] == col for c in insp.get_columns(table))


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not _has_table(insp, "roles"):
        op.create_table(
            "roles",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("base_role", sa.String(), nullable=True),
            sa.Column("permissions", sa.JSON(), nullable=True),
            sa.Column("is_system", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_roles_company_id", "roles", ["company_id"])

    if not _has_table(insp, "org_units"):
        op.create_table(
            "org_units",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("parent_id", sa.String(), nullable=True),
            sa.Column("type", sa.String(), nullable=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
            sa.ForeignKeyConstraint(["parent_id"], ["org_units.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_org_units_company_id", "org_units", ["company_id"])
        op.create_index("ix_org_units_parent_id", "org_units", ["parent_id"])

    if not _has_column(insp, "users", "role_id"):
        op.add_column("users", sa.Column("role_id", sa.String(), nullable=True))
        op.create_foreign_key("fk_users_role_id", "users", "roles", ["role_id"], ["id"])
    if not _has_column(insp, "users", "org_unit_id"):
        op.add_column("users", sa.Column("org_unit_id", sa.String(), nullable=True))
        op.create_foreign_key("fk_users_org_unit_id", "users", "org_units", ["org_unit_id"], ["id"])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if _has_column(insp, "users", "org_unit_id"):
        op.drop_constraint("fk_users_org_unit_id", "users", type_="foreignkey")
        op.drop_column("users", "org_unit_id")
    if _has_column(insp, "users", "role_id"):
        op.drop_constraint("fk_users_role_id", "users", type_="foreignkey")
        op.drop_column("users", "role_id")
    if _has_table(insp, "org_units"):
        op.drop_table("org_units")
    if _has_table(insp, "roles"):
        op.drop_table("roles")
