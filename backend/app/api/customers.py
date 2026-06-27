# app/api/customers.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.infrastructure.database import get_db_session
from app.core.auth import get_current_user_and_company
from app.domain.models import CustomerProfile

router = APIRouter(prefix="/api/customers", tags=["Customers"])


@router.get("/{company_id}/{customer_id}")
def get_customer(
    company_id: str,
    customer_id: str,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    if str(token_data.company_id) != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    profile = (
        db.query(CustomerProfile)
        .filter_by(company_id=company_id, customer_hash=customer_id)
        .first()
    )

    if not profile:
        raise HTTPException(status_code=404, detail="Cliente não encontrado no histórico.")

    # Defaults seguros: profiles antigos/parciais podem ter campos nulos ou ausentes.
    # A serialização nunca deve quebrar (500) nem entregar null em campos que o
    # frontend acessa direto (rfv.segment, alerts[], etc.).
    rfv = getattr(profile, "rfv", None) or {
        "recency": 0, "frequency": 0, "value": 0.0,
        "recencyScore": 1, "frequencyScore": 1, "valueScore": 1,
        "segment": "new",
    }

    return {
        "success": True,
        "data": {
            "id": profile.customer_hash,
            "name": profile.customer_name,
            "document": getattr(profile, "document_id", None),
            "branch": getattr(profile, "branch", None),
            "salesperson": getattr(profile, "salesperson", None),
            "totalRevenue": profile.total_revenue or 0.0,
            "percentage": profile.percentage or 0.0,
            "trend": profile.trend or "stable",
            "rfv": rfv,
            "topProducts": getattr(profile, "top_products", None) or [],
            "revenueHistory": getattr(profile, "monthly_revenue", None) or [],
            "alerts": getattr(profile, "alerts", None) or [],
        },
    }
