# data_engine/validators.py
import logging
from datetime import date
from typing import List, Tuple

import polars as pl

logger = logging.getLogger(__name__)

REQUIRED_COLS = ["date", "customer_id", "revenue"]


class ValidationError(ValueError):
    """Inherits from ValueError so the worker treats it as non-retryable."""
    pass


def validate_dataframe(df: pl.DataFrame) -> Tuple[pl.DataFrame, List[str]]:
    """
    Validates and cleans a normalised sales DataFrame.
    Returns (cleaned_df, warnings). Raises ValidationError for fatal issues.
    """
    warnings: List[str] = []
    total_rows = len(df)

    if total_rows == 0:
        raise ValidationError("Arquivo sem registros válidos.")

    # 1. Required columns present
    missing = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing:
        raise ValidationError(f"Colunas obrigatórias ausentes após normalização: {missing}")

    # 2. Null rate check — fatal if value column is >50% null
    for col in REQUIRED_COLS:
        null_count = df[col].null_count()
        if null_count == 0:
            continue
        pct = round(null_count / total_rows * 100, 1)
        if col == "revenue" and pct > 50:
            raise ValidationError(
                f"Coluna '{col}' tem {pct}% de valores nulos — arquivo provavelmente inválido."
            )
        warnings.append(f"Coluna '{col}': {null_count} valores nulos ({pct}%) serão removidos.")

    # 3. Drop rows where any required column is null
    df = df.filter(
        pl.col("date").is_not_null()
        & pl.col("customer_id").is_not_null()
        & pl.col("revenue").is_not_null()
    )

    if len(df) == 0:
        raise ValidationError("Nenhum registro restou após remover linhas com dados obrigatórios nulos.")

    # 4. Remove non-positive revenue
    neg = df.filter(pl.col("revenue") <= 0).height
    if neg > 0:
        pct = round(neg / total_rows * 100, 1)
        warnings.append(f"{neg} registros com valor <= 0 ({pct}%) removidos.")
        df = df.filter(pl.col("revenue") > 0)

    # 5. Remove future dates
    if df["date"].dtype in (pl.Date, pl.Datetime):
        try:
            today = date.today()
            future = df.filter(pl.col("date").cast(pl.Date) > pl.lit(today)).height
            if future > 0:
                warnings.append(f"{future} registros com data futura removidos.")
                df = df.filter(pl.col("date").cast(pl.Date) <= pl.lit(today))
        except Exception:
            pass

    # 6. Minimum viable row count
    if len(df) < 5:
        raise ValidationError(
            f"Apenas {len(df)} registros válidos após limpeza. "
            "Verifique se o arquivo contém dados de vendas reais."
        )

    dropped = total_rows - len(df)
    if dropped:
        logger.info("validators.rows_dropped", extra={"total": total_rows, "dropped": dropped})

    return df, warnings
