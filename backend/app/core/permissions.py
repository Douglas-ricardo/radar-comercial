"""RBAC granular — catálogo de permissões, presets dos papéis legados e resolução.

Mantém retrocompatibilidade total: usuários sem `role_id` herdam o preset do papel
legado (admin/analyst/viewer). Papéis customizados (Role) sobrepõem o preset.
"""
import logging
from typing import Iterable

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_and_company, TokenData
from app.infrastructure.database import get_db_session

logger = logging.getLogger(__name__)

# Catálogo canônico: chave → (grupo, rótulo pt-BR). Fonte da matriz no frontend.
PERMISSION_CATALOG: dict[str, tuple[str, str]] = {
    "insights.read":      ("Análise", "Ver insights e análises"),
    "carteira.read":      ("Carteira", "Ver carteira de oportunidades"),
    "carteira.write":     ("Carteira", "Atualizar status de oportunidades"),
    "customers.read":     ("Clientes", "Ver perfis de clientes"),
    "outreach.manage":    ("Disparo", "Configurar e disparar mensagens"),
    "campaigns.manage":   ("Campanhas", "Criar e enviar campanhas"),
    "reports.read":       ("Relatórios", "Gerar e baixar relatórios"),
    "integrations.manage": ("Conta", "Gerenciar integrações e API keys"),
    "team.manage":        ("Conta", "Gerenciar membros da equipe"),
    "billing.manage":     ("Conta", "Gerenciar plano e faturamento"),
    "company.manage":     ("Conta", "Editar dados da empresa"),
    "sso.manage":         ("Segurança", "Gerenciar SSO e provisionamento"),
    "audit.read":         ("Segurança", "Ver log de auditoria"),
    "roles.manage":       ("Segurança", "Gerenciar papéis e permissões"),
    "org.manage":         ("Segurança", "Gerenciar estrutura organizacional"),
}

ALL_PERMISSIONS = set(PERMISSION_CATALOG.keys())

# Presets dos papéis legados — base de retrocompatibilidade.
PRESETS: dict[str, set[str]] = {
    "admin": set(ALL_PERMISSIONS),
    "analyst": {
        "insights.read", "carteira.read", "carteira.write", "customers.read",
        "outreach.manage", "campaigns.manage", "reports.read",
    },
    "viewer": {"insights.read", "carteira.read", "customers.read", "reports.read"},
}


def resolve_permissions(db: Session, user) -> set[str]:
    """Permissões efetivas: papel customizado (role_id) tem prioridade; senão, preset."""
    role_id = getattr(user, "role_id", None)
    if role_id:
        from app.domain.models import Role
        role = db.query(Role).filter_by(id=role_id, company_id=user.company_id).first()
        if role and role.permissions is not None:
            return set(role.permissions) & ALL_PERMISSIONS
    return set(PRESETS.get(user.role, PRESETS["viewer"]))


def require_permission(permission: str):
    """Factory de dependency: exige uma permissão específica no token."""
    def _checker(token: TokenData = Depends(get_current_user_and_company)) -> TokenData:
        if permission not in (token.permissions or []):
            raise HTTPException(status_code=403, detail="Permissão insuficiente para esta ação.")
        return token
    return _checker


def has_permission(token: TokenData, permission: str) -> bool:
    return permission in (token.permissions or [])


# ─── Hierarquia organizacional (OrgUnit) ──────────────────────────────────────

def subtree_unit_ids(db: Session, company_id: str, root_id: str) -> set[str]:
    """IDs de todas as unidades na subárvore de root_id (inclusive)."""
    from app.domain.models import OrgUnit
    units = db.query(OrgUnit.id, OrgUnit.parent_id).filter_by(company_id=company_id).all()
    children: dict[str, list[str]] = {}
    for uid, parent in units:
        children.setdefault(parent, []).append(uid)
    result: set[str] = set()
    stack = [root_id]
    while stack:
        cur = stack.pop()
        if cur in result:
            continue
        result.add(cur)
        stack.extend(children.get(cur, []))
    return result


def visible_branches(db: Session, company_id: str, org_unit_id: str | None) -> set[str] | None:
    """Nomes de filiais (CustomerProfile.branch) visíveis para a unidade do usuário.
    None = sem restrição (admin / sem unidade atribuída)."""
    if not org_unit_id:
        return None
    from app.domain.models import OrgUnit
    ids = subtree_unit_ids(db, company_id, org_unit_id)
    if not ids:
        return None
    rows = db.query(OrgUnit.name).filter(
        OrgUnit.company_id == company_id,
        OrgUnit.id.in_(ids),
        OrgUnit.type == "branch",
    ).all()
    return {r[0] for r in rows}
