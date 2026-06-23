# ml/features.py
"""Extração de features p/ o modelo de churn. Mesma fonte usada no treino e na
inferência — garante que o vetor é idêntico nos dois lados."""
from __future__ import annotations

FEATURE_NAMES = ["recency_days", "avg_interval_days", "frequency", "overdue_ratio"]


def extract_features(recency_days: float, avg_interval_days: float, frequency: float) -> list[float]:
    ratio = (recency_days / avg_interval_days) if avg_interval_days and avg_interval_days > 0 else 0.0
    return [float(recency_days), float(avg_interval_days), float(frequency), float(ratio)]
