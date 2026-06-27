"""Geração de dados demo para tenants sandbox — permite testar o produto sem
upload real. Idempotente: limpa insights/perfis anteriores antes de semear."""
import hashlib
import logging
import random

from sqlalchemy.orm import Session

from app.domain.models import ComputedInsights, CustomerProfile

logger = logging.getLogger(__name__)

_NAMES = [
    "Padaria Pão Quente", "Auto Peças Veloz", "Farmácia Saúde+", "Mercado Bom Preço",
    "Construtora Alicerce", "Restaurante Sabor", "Ótica Visão", "Pet Shop Amigo Fiel",
    "Papelaria Escrever", "Distribuidora Norte", "Loja do Bebê", "Açougue Premium",
]
_BRANCHES = ["SP-001", "RJ-001", "MG-001"]
_SELLERS = ["Ana Costa", "Bruno Lima", "Carla Souza"]
_MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]


def seed_demo_data(db: Session, company) -> None:
    # Limpa dados anteriores da empresa (sandbox é reconstruível).
    db.query(CustomerProfile).filter_by(company_id=company.id).delete()
    db.query(ComputedInsights).filter_by(company_id=company.id).delete()

    profiles = []
    opportunities = []
    total_revenue = 0.0
    lost_revenue = 0.0
    for i, name in enumerate(_NAMES):
        rng = random.Random(name)
        revenue = round(rng.uniform(8000, 90000), 2)
        total_revenue += revenue
        recency = rng.choice([10, 25, 40, 70, 120, 200])
        segment = "lost" if recency > 150 else ("at_risk" if recency > 60 else rng.choice(["champion", "loyal", "new"]))
        # Status canônico (fonte única): demo "lost"→churned, "at_risk"→at_risk, resto→active.
        # A elegibilidade do disparo e o churn-risk leem `status`/`expected_value` (não `segment`).
        status = "churned" if segment == "lost" else ("at_risk" if segment == "at_risk" else "active")
        is_opp = status in ("at_risk", "churned")
        # expected_value = MESMO valor da oportunidade (consistência churn-risk ↔ Carteira ↔ disparo).
        exp = round(revenue * 0.15, 2) if is_opp else 0.0
        rec_score = min(95, 40 + recency // 4) if is_opp else 0
        chash = hashlib.sha256(f"{company.id}:{name}".encode()).hexdigest()[:16]
        # Histórico mensal: ativo nos primeiros meses, esfria conforme recência.
        active_months = len(_MONTHS) - min(recency // 40, len(_MONTHS) - 1)
        monthly = [{"month": m, "value": round(revenue / max(active_months, 1), 2) if idx < active_months else 0.0}
                   for idx, m in enumerate(_MONTHS)]
        profiles.append(CustomerProfile(
            company_id=company.id, customer_hash=chash, customer_name=name,
            branch=_BRANCHES[i % len(_BRANCHES)], salesperson=_SELLERS[i % len(_SELLERS)],
            total_revenue=revenue, recency_days=recency, segment=segment,
            churn_risk="high" if segment == "at_risk" else ("medium" if recency > 40 else "none"),
            churn_score=min(99, recency // 2), avg_interval_days=float(rng.choice([20, 30, 45])),
            monthly_revenue=monthly, rfv={"recency": recency, "frequency": rng.randint(1, 12), "value": revenue},
            phone=None, email=None,
            status=status, expected_value=exp, recovery_score=rec_score,
            recovery_band="alta" if rec_score >= 70 else ("media" if rec_score >= 40 else "baixa"),
            priority_value=round(exp * rec_score / 100, 2),
        ))
        if is_opp:
            lost_revenue += exp
            opportunities.append({
                "id": chash, "customerHash": chash, "customer": name,
                "product": rng.choice(["Recompra mensal", "Mix completo", "Linha premium"]),
                "type": "declining_customer", "lastPurchase": None,
                "frequency": None, "expectedValue": exp,
                "confidence": rng.choice(["high", "medium"]),
                "branch": _BRANCHES[i % len(_BRANCHES)], "salesperson": _SELLERS[i % len(_SELLERS)],
            })

    for p in profiles:
        db.add(p)

    summary = {
        "totalRevenue": round(total_revenue, 2),
        "lostRevenue": round(lost_revenue, 2),
        "lostRate": round(100 * lost_revenue / total_revenue, 1) if total_revenue else 0,
        "revenueGrowth": 8.5, "uniqueCustomers": len(_NAMES), "uniqueProducts": 24,
        "dataFreshness": "live",
    }
    charts = {
        "timeSeries": [{"month": m, "receita": round(total_revenue / len(_MONTHS) * (0.8 + i * 0.05), 2),
                        "perdida": round(lost_revenue / len(_MONTHS), 2)} for i, m in enumerate(_MONTHS)],
        "customerDistribution": [], "productGaps": [], "seasonality": [],
    }
    db.add(ComputedInsights(
        company_id=company.id, date_range="1m",
        summary=summary, opportunities=opportunities, charts=charts,
    ))
    company.is_sandbox = True
    db.commit()
    logger.info("demo.seeded", extra={"company_id": company.id, "customers": len(profiles)})
