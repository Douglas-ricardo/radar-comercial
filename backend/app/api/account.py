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
            "companyId": user.company_id,
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
        },
    }
