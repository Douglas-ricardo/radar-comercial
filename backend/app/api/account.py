# app/api/account.py
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_and_company
from app.domain.models import Company, User
from app.infrastructure.database import get_db_session

logger = logging.getLogger(__name__)

users_router = APIRouter(prefix="/api/users", tags=["Users"])
company_router = APIRouter(prefix="/api/company", tags=["Company"])


class UpdateUserRequest(BaseModel):
    name: str | None = None


class UpdateCompanyRequest(BaseModel):
    name: str | None = None
    cnpj: str | None = None
    purchase_cycle_days: int | None = None


@users_router.patch("/{user_id}")
def update_user(
    user_id: str,
    data: UpdateUserRequest,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if user_id != token_data.user_id:
        raise HTTPException(status_code=403, detail="Só é possível atualizar a própria conta.")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")

    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="O nome não pode ficar em branco.")
        user.name = name

    db.commit()
    db.refresh(user)

    logger.info("user.profile.updated", extra={"user_id": user_id})

    return {
        "success": True,
        "data": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "status": user.status,
            "companyId": user.company_id,
            "createdAt": user.created_at.isoformat() if user.created_at else None,
            "updatedAt": user.updated_at.isoformat() if user.updated_at else None,
        },
    }


@company_router.patch("/{company_id}")
def update_company(
    company_id: str,
    data: UpdateCompanyRequest,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if company_id != token_data.company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")
    if token_data.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem editar a empresa.")

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="O nome não pode ficar em branco.")
        company.name = name

    if data.cnpj is not None:
        company.cnpj = data.cnpj.strip() or None

    if data.purchase_cycle_days is not None:
        if not (1 <= data.purchase_cycle_days <= 365):
            raise HTTPException(status_code=400, detail="Ciclo de compra deve ser entre 1 e 365 dias.")
        company.purchase_cycle_days = data.purchase_cycle_days

    db.commit()
    db.refresh(company)

    logger.info("company.profile.updated", extra={"company_id": company_id})

    return {
        "success": True,
        "data": {
            "id": company.id,
            "name": company.name,
            "cnpj": company.cnpj,
            "plan": company.plan,
            "uploadsLimit": company.uploads_limit,
            "uploadsUsed": company.uploads_used,
            "purchaseCycleDays": company.purchase_cycle_days,
            "ownerId": company.owner_id,
            "createdAt": company.created_at.isoformat() if company.created_at else None,
            "updatedAt": company.updated_at.isoformat() if company.updated_at else None,
        },
    }
