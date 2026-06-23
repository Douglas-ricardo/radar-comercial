# app/api/team.py
import logging
import uuid
from typing import Literal

import re

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

# Regex simples mas suficiente para descartar entradas claramente inválidas;
# validação canônica deveria vir de email-validator, mas evitamos a dependência extra.
_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")

from app.infrastructure.database import get_db_session
from app.domain.models import User, Company
from app.core.auth import get_current_user_and_company
from app.services.plan_service import PlanService
from app.services.notification_service import NotificationService
from app.api.billing import sync_subscription_seats

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/team", tags=["Team"])

TeamRole = Literal["admin", "analyst", "viewer"]


class InviteRequest(BaseModel):
    email: str
    role: TeamRole

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        normalized = v.strip().lower()
        if not _EMAIL_RE.match(normalized):
            raise ValueError("Email inválido.")
        return normalized


class UpdateRoleRequest(BaseModel):
    role: TeamRole


@router.get("/{company_id}")
def list_team_members(
    company_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if token_data.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    base = db.query(User).filter(User.company_id == company_id)
    total = base.count()
    users = base.offset(offset).limit(limit).all()

    return {
        "success": True,
        "data": [
            {
                "id": u.id,
                "email": u.email,
                "name": u.name,
                "role": u.role,
                "status": u.status,
                "createdAt": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
        "pagination": {"total": total, "limit": limit, "offset": offset},
    }


@router.post("/{company_id}/invite")
def invite_member(
    company_id: str,
    data: InviteRequest,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if token_data.company_id != company_id or token_data.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem convidar novos membros.")

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    current_count = db.query(User).filter(User.company_id == company_id).count()
    PlanService.check_user_limit(company, current_count)

    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Este email já está registado no Radar Comercial.")

    temp_password = str(uuid.uuid4())
    hashed_password = bcrypt.hashpw(
        temp_password.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")

    new_user = User(
        email=data.email,
        name="Utilizador Convidado",
        hashed_password=hashed_password,
        role=data.role,
        status="pending",
        company_id=company_id,
    )
    db.add(new_user)
    db.commit()

    # Cobrança per-seat: ajusta a assinatura ao novo nº de usuários.
    sync_subscription_seats(company_id, db)

    logger.info(
        "team.invite.sent",
        extra={"company_id": company_id, "invited_email": data.email, "role": data.role},
    )

    inviter = db.query(User).filter(User.id == token_data.user_id).first()
    try:
        NotificationService.send_invite_email(
            to_email=data.email,
            inviter_name=inviter.name if inviter else "Equipe Radar Comercial",
            company_name=company.name,
            temp_password=temp_password,
        )
    except Exception as exc:
        logger.warning("team.invite.email_error", extra={"email": data.email, "error": str(exc)})

    return {"success": True, "message": "Convite enviado com sucesso!"}


@router.delete("/members/{user_id}")
def remove_member(
    user_id: str,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if token_data.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem remover membros.")

    user_to_delete = db.query(User).filter(User.id == user_id).first()

    if not user_to_delete or user_to_delete.company_id != token_data.company_id:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")

    if user_to_delete.id == token_data.user_id:
        raise HTTPException(status_code=400, detail="Não pode remover a sua própria conta.")

    db.delete(user_to_delete)
    db.commit()

    # Cobrança per-seat: reduz a assinatura ao novo nº de usuários.
    sync_subscription_seats(token_data.company_id, db)

    logger.info("team.member.removed", extra={"removed_user_id": user_id, "admin_id": token_data.user_id})

    return {"success": True, "message": "Membro removido com sucesso."}


@router.patch("/members/{user_id}/role")
def update_member_role(
    user_id: str,
    data: UpdateRoleRequest,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if token_data.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem alterar funções.")

    user_to_update = db.query(User).filter(User.id == user_id).first()
    if not user_to_update or user_to_update.company_id != token_data.company_id:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")

    if user_to_update.id == token_data.user_id and data.role != "admin":
        raise HTTPException(
            status_code=400,
            detail="Não pode rebaixar a sua própria conta de administrador.",
        )

    user_to_update.role = data.role
    db.commit()

    logger.info("team.member.role_updated", extra={"user_id": user_id, "role": data.role})

    return {
        "success": True,
        "data": {
            "id": user_to_update.id,
            "email": user_to_update.email,
            "name": user_to_update.name,
            "role": user_to_update.role,
            "status": user_to_update.status,
        },
    }


@router.post("/members/{user_id}/resend-invite")
def resend_invite(
    user_id: str,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if token_data.role != "admin":
        raise HTTPException(status_code=403, detail="Acesso negado.")

    # Valida que o usuário existe, pertence à empresa e está realmente pendente.
    # Antes, qualquer user_id retornava sucesso independente de existir.
    user = db.query(User).filter(
        User.id == user_id,
        User.company_id == token_data.company_id,
        User.status == "pending",
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Convite pendente não encontrado. O utilizador pode já ter aceitado o convite.",
        )

    logger.info("team.invite.resent", extra={"user_id": user_id, "email": user.email})

    new_temp = str(uuid.uuid4())
    user.hashed_password = bcrypt.hashpw(new_temp.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    db.commit()

    inviter = db.query(User).filter(User.id == token_data.user_id).first()
    company = db.query(Company).filter(Company.id == token_data.company_id).first()
    try:
        NotificationService.send_invite_email(
            to_email=user.email,
            inviter_name=inviter.name if inviter else "Equipe Radar Comercial",
            company_name=company.name if company else "Radar Comercial",
            temp_password=new_temp,
        )
    except Exception as exc:
        logger.warning("team.resend_invite.email_error", extra={"email": user.email, "error": str(exc)})

    return {"success": True, "message": "Convite reenviado com sucesso!"}