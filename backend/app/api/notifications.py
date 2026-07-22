# app/api/notifications.py
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_and_company
from app.domain.models import Company, ComputedInsights, NotificationPreference, User
from app.infrastructure.database import get_db_session
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

_DEFAULTS = {
    "enabled": True,
    "emailEnabled": True,
    "whatsappEnabled": False,
    "whatsappPhone": None,
    "sendHour": 8,
    "minOpportunityValue": 0.0,
}


class UpdatePreferenceRequest(BaseModel):
    model_config = {"populate_by_name": True}

    enabled: Optional[bool] = None
    emailEnabled: Optional[bool] = None
    whatsappEnabled: Optional[bool] = None
    whatsappPhone: Optional[str] = None
    sendHour: Optional[int] = None
    minOpportunityValue: Optional[float] = None

    @field_validator("sendHour")
    @classmethod
    def validate_hour(cls, v):
        if v is not None and not (0 <= v <= 23):
            raise ValueError("Hora deve ser entre 0 e 23.")
        return v

    @field_validator("minOpportunityValue")
    @classmethod
    def validate_min_value(cls, v):
        if v is not None and v < 0:
            raise ValueError("Valor mínimo não pode ser negativo.")
        return v


def _pref_to_dict(pref: NotificationPreference) -> dict:
    return {
        "enabled": pref.enabled,
        "emailEnabled": pref.email_enabled,
        "whatsappEnabled": pref.whatsapp_enabled,
        "whatsappPhone": pref.whatsapp_phone,
        "sendHour": pref.send_hour,
        "minOpportunityValue": pref.min_opportunity_value,
    }


@router.get("/preferences")
def get_preferences(
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    pref = db.query(NotificationPreference).filter(
        NotificationPreference.user_id == token_data.user_id
    ).first()

    return {"success": True, "data": _pref_to_dict(pref) if pref else _DEFAULTS}


@router.patch("/preferences")
def update_preferences(
    data: UpdatePreferenceRequest,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    pref = db.query(NotificationPreference).filter(
        NotificationPreference.user_id == token_data.user_id
    ).first()

    if not pref:
        pref = NotificationPreference(
            user_id=token_data.user_id,
            company_id=token_data.company_id,
        )
        db.add(pref)

    _field_map = {
        "emailEnabled": "email_enabled",
        "whatsappEnabled": "whatsapp_enabled",
        "whatsappPhone": "whatsapp_phone",
        "sendHour": "send_hour",
        "minOpportunityValue": "min_opportunity_value",
    }
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(pref, _field_map.get(field, field), value)

    db.commit()
    logger.info("notifications.preferences.updated", extra={"user_id": token_data.user_id})
    return {"success": True, "message": "Preferências atualizadas com sucesso."}


@router.post("/test-send")
def test_send(
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    user = db.query(User).filter(User.id == token_data.user_id).first()
    company = db.query(Company).filter(Company.id == token_data.company_id).first()
    if not user or not company:
        raise HTTPException(status_code=404, detail="Usuário ou empresa não encontrado.")

    pref = db.query(NotificationPreference).filter(
        NotificationPreference.user_id == token_data.user_id
    ).first()

    insights = db.query(ComputedInsights).filter_by(
        company_id=token_data.company_id, date_range="1m"
    ).first()
    sample = (insights.opportunities[:3] if insights and insights.opportunities else [])

    results: dict = {}

    html = NotificationService.format_opportunity_email(user.name, sample, company.name, company.currency)
    subject = "[Teste] Radar Comercial — Notificação de teste"
    results["email"] = NotificationService.send_email(user.email, subject, html)

    if pref and pref.whatsapp_enabled and pref.whatsapp_phone:
        msg = NotificationService.format_opportunity_whatsapp(user.name, sample, company.currency)
        results["whatsapp"] = NotificationService.send_whatsapp(pref.whatsapp_phone, msg)

    logger.info("notifications.test_send", extra={"user_id": token_data.user_id})

    if not any(results.values()):
        return {
            "success": False,
            "message": "Nenhuma notificação enviada. Verifique RESEND_API_KEY e WHATSAPP_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID no .env.",
            "data": results,
        }

    return {"success": True, "message": "Notificação de teste enviada.", "data": results}
