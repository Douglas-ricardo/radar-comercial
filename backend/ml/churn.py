# ml/churn.py
"""Churn preditivo — antecipa quem VAI sumir, antes de virar cliente perdido.

Heurística (não-ML pesado, mas com base estatística por cliente): cada cliente
tem um intervalo médio de compra. Se já passou do intervalo esperado mas o cliente
ainda NÃO é churned (recência <= limiar), ele está "atrasado" e em risco de sumir.
Quanto mais regular o histórico (mais compras) e mais atrasado, maior o risco.

Diferença para o churn reativo do ETL: lá detectamos quem JÁ sumiu (>60 dias);
aqui detectamos quem está prestes a sumir — janela de ação proativa.
"""
from __future__ import annotations

# Mínimo de compras para o intervalo médio ser confiável.
_MIN_PURCHASES = 3


def assess_churn_risk(
    recency_days: int,
    avg_interval_days: float,
    frequency: int,
    cycle_days: int = 90,
) -> dict:
    """
    Retorna {risk, score, days_overdue}:
      - risk: "none" | "low" | "medium" | "high"
      - score: 0–100 (proporcional a quão atrasado está)
      - days_overdue: dias além do intervalo médio esperado

    cycle_days: ciclo de compra configurado pela empresa (default 90).
    Clientes com recency > cycle_days já são tratados como churned reativos
    pelo ETL — aqui detectamos quem está prestes a sumir (janela proativa).
    """
    none = {"risk": "none", "score": 0, "days_overdue": 0}

    # histórico insuficiente ou cadência indefinida → não prevemos
    if frequency < _MIN_PURCHASES or avg_interval_days <= 0:
        return none
    # já passou do limiar de churn → é reativo, não preditivo
    if recency_days > cycle_days:
        return none

    ratio = recency_days / avg_interval_days
    days_overdue = max(0, int(round(recency_days - avg_interval_days)))
    score = max(0, min(100, int(ratio * 50)))

    if ratio >= 1.5:
        risk = "high"
    elif ratio >= 1.2:
        risk = "medium"
    elif ratio >= 1.0:
        risk = "low"
    else:
        return none

    return {"risk": risk, "score": score, "days_overdue": days_overdue}
