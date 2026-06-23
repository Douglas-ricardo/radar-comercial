# ml/inference.py
"""Inferência de churn: usa o modelo treinado se existir; senão cai na heurística
de cadência (ml/churn.py). Mesma assinatura do heurístico, então o ETL só troca
o import. sklearn/joblib são carregados de forma preguiçosa — o app não depende
deles enquanto não houver modelo."""
from __future__ import annotations

import logging
import os
import threading

from ml.churn import assess_churn_risk as _heuristic
from ml.features import extract_features

logger = logging.getLogger(__name__)

_MODEL_PATH = os.getenv(
    "CHURN_MODEL_PATH", os.path.join(os.path.dirname(__file__), "model.joblib")
)
_MIN_PURCHASES = 3
_DEFAULT_CYCLE_DAYS = 90

_model = None
_loaded = False
_lock = threading.Lock()


def _load_model():
    global _model, _loaded
    if _loaded:
        return _model
    with _lock:
        if _loaded:
            return _model
        _loaded = True
        if not os.path.exists(_MODEL_PATH):
            return None
        try:
            import joblib

            _model = joblib.load(_MODEL_PATH)
            logger.info("ml.churn.model_carregado", extra={"path": _MODEL_PATH})
        except Exception as e:  # modelo corrompido / joblib ausente → heurística
            logger.warning("ml.churn.model_falhou", extra={"erro": str(e)})
            _model = None
        return _model


def assess_churn_risk(
    recency_days: int,
    avg_interval_days: float,
    frequency: int,
    cycle_days: int = _DEFAULT_CYCLE_DAYS,
) -> dict:
    """Igual ao heurístico: {risk, score, days_overdue}. Usa modelo se disponível."""
    none = {"risk": "none", "score": 0, "days_overdue": 0}

    # Guardas idênticas ao heurístico (coerência com o churn reativo do ETL)
    if frequency < _MIN_PURCHASES or avg_interval_days <= 0:
        return none
    if recency_days > cycle_days:
        return none

    model = _load_model()
    if model is None:
        return _heuristic(recency_days, avg_interval_days, frequency, cycle_days)

    try:
        prob = float(model.predict_proba([extract_features(recency_days, avg_interval_days, frequency)])[0][1])
    except Exception as e:
        logger.warning("ml.churn.predict_falhou", extra={"erro": str(e)})
        return _heuristic(recency_days, avg_interval_days, frequency, cycle_days)

    days_overdue = max(0, int(round(recency_days - avg_interval_days)))
    score = max(0, min(100, int(round(prob * 100))))
    if prob >= 0.66:
        risk = "high"
    elif prob >= 0.40:
        risk = "medium"
    elif prob >= 0.20:
        risk = "low"
    else:
        return none
    return {"risk": risk, "score": score, "days_overdue": days_overdue, "source": "model"}
