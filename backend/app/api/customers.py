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

    return {
        "success": True,
        "data": {
            "id": profile.customer_hash,
            "name": profile.customer_name,
            "document": profile.document_id,
            "branch": profile.branch,
            "salesperson": profile.salesperson,
            "totalRevenue": profile.total_revenue,
            "percentage": profile.percentage,
            "trend": profile.trend,
            "rfv": profile.rfv,
            "topProducts": profile.top_products,
            "revenueHistory": profile.monthly_revenue,
            "alerts": profile.alerts,
        },
    }
