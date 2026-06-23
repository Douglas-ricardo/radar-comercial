# ml/train.py
"""Treina o modelo de churn preditivo (GradientBoosting sobre features de cadência).

Uso (a partir de backend/):
    python -m ml.train --data labels.csv     # CSV: recency_days,avg_interval_days,frequency,label
    python -m ml.train --synthetic            # dados sintéticos (bootstrap / smoke)

Salva em ml/model.joblib (ou CHURN_MODEL_PATH). A inferência (ml/inference.py)
passa a usar o modelo automaticamente; sem modelo, usa a heurística.

NOTA honesta: o modelo só fica melhor que a heurística quando treinado com
RÓTULOS reais — ou seja, observações passadas marcando quem de fato sumiu/voltou.
Esses rótulos vêm de OutreachAttribution/recovery acumulados ao longo do tempo.
Enquanto isso, `--synthetic` serve para validar o pipeline ponta a ponta.
"""
from __future__ import annotations

import argparse
import logging
import os

from ml.features import extract_features, FEATURE_NAMES

logger = logging.getLogger(__name__)
_MODEL_PATH = os.getenv("CHURN_MODEL_PATH", os.path.join(os.path.dirname(__file__), "model.joblib"))


def _synthetic(n: int = 2000, seed: int = 42):
    import random

    random.seed(seed)
    rows = []
    for _ in range(n):
        freq = random.randint(3, 30)
        interval = random.uniform(5.0, 60.0)
        churn = random.random() < 0.4
        if churn:
            recency = interval * random.uniform(1.3, 3.0)
        else:
            recency = interval * random.uniform(0.2, 1.1)
        recency = min(recency, 59.0)  # dentro da janela preditiva (<60)
        rows.append((recency, interval, freq, 1 if churn else 0))
    return rows


def _load_csv(path: str):
    import csv

    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            rows.append((
                float(r["recency_days"]),
                float(r["avg_interval_days"]),
                int(r["frequency"]),
                int(r["label"]),
            ))
    return rows


def train(rows, model_path: str = _MODEL_PATH) -> dict:
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import roc_auc_score
    import joblib

    X = [extract_features(r[0], r[1], r[2]) for r in rows]
    y = [r[3] for r in rows]
    stratify = y if len(set(y)) > 1 else None
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=42, stratify=stratify)

    clf = GradientBoostingClassifier(random_state=42)
    clf.fit(X_tr, y_tr)

    auc = (
        roc_auc_score(y_te, [p[1] for p in clf.predict_proba(X_te)])
        if len(set(y_te)) > 1
        else float("nan")
    )
    joblib.dump(clf, model_path)
    result = {"auc": round(float(auc), 4), "n": len(rows), "path": model_path, "features": FEATURE_NAMES}
    logger.info("ml.churn.treinado", extra=result)
    return result


def main():
    logging.basicConfig(level=logging.INFO)
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", help="CSV: recency_days,avg_interval_days,frequency,label")
    ap.add_argument("--synthetic", action="store_true", help="usa dados sintéticos")
    ap.add_argument("--out", default=_MODEL_PATH)
    args = ap.parse_args()

    rows = _load_csv(args.data) if (args.data and not args.synthetic) else _synthetic()
    print(train(rows, args.out))


if __name__ == "__main__":
    main()
