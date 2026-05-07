# data_engine/etl.py
import hashlib
import logging
import os
import unicodedata
import uuid
from datetime import date, datetime, timedelta

import polars as pl

logger = logging.getLogger(__name__)

# ─── Column normalisation ─────────────────────────────────────────────────────

CANONICAL_COLUMNS = {
    "data": "date", "data_venda": "date", "data da venda": "date", "date": "date",
    "cliente": "customer_id", "customer": "customer_id", "nome": "customer_id",
    "comprador": "customer_id", "customer_id": "customer_id",
    "produto": "product_id", "product": "product_id", "item": "product_id",
    "servico": "product_id", "product_id": "product_id",
    "quantidade": "qty", "qty": "qty", "qtd": "qty", "quant": "qty",
    "valor": "revenue", "revenue": "revenue", "preco": "revenue", "total": "revenue",
}

DATE_RANGES = ("1m", "3m", "6m", "12m")
_DAYS_MAP = {"1m": 30, "3m": 90, "6m": 180, "12m": 365}

_STRING_TYPES: tuple
try:
    _STRING_TYPES = (pl.Utf8, pl.String)
except AttributeError:
    _STRING_TYPES = (pl.Utf8,)


def normalize_columns(df: pl.DataFrame) -> pl.DataFrame:
    rename_map = {
        c: CANONICAL_COLUMNS[c.lower().strip()]
        for c in df.columns
        if c.lower().strip() in CANONICAL_COLUMNS
    }
    return df.rename(rename_map) if rename_map else df


def normalize_customer_name(name: str) -> str:
    if not name:
        return ""
    s = str(name).strip()
    nfkd = unicodedata.normalize("NFKD", s)
    return nfkd.encode("ascii", "ignore").decode("ascii").lower().strip()


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _ensure_optional_columns(df: pl.DataFrame) -> pl.DataFrame:
    extras = []
    if "product_id" not in df.columns:
        extras.append(pl.lit("Geral").alias("product_id"))
    if "qty" not in df.columns:
        extras.append(pl.lit(1.0).alias("qty"))
    return df.with_columns(extras) if extras else df


# Formatos de data tentados em ordem — o que parsear mais linhas vence.
_DATE_FORMATS = ["%d/%m/%Y", "%Y-%m-%d", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"]


def _parse_dates_multi_format(df: pl.DataFrame) -> pl.DataFrame:
    """
    Tenta cada formato em _DATE_FORMATS e fica com o que produziu menos nulls.
    Resolve casos em que planilhas vêm em ISO, formato US ou BR sem aviso prévio.
    """
    best_series = None
    best_nulls = None
    for fmt in _DATE_FORMATS:
        parsed = df["date"].str.to_date(fmt, strict=False)
        nulls = parsed.null_count()
        if best_nulls is None or nulls < best_nulls:
            best_series = parsed
            best_nulls = nulls
    return df.with_columns(best_series.alias("date"))


def _cast_types(df: pl.DataFrame) -> pl.DataFrame:
    if "revenue" in df.columns and df["revenue"].dtype in _STRING_TYPES:
        df = df.with_columns(
            pl.col("revenue")
            .str.replace_all(r"R\$", "").str.replace_all(r"\.", "")
            .str.replace_all(",", ".").str.strip_chars()
            .cast(pl.Float64, strict=False)
        )
    if "date" in df.columns:
        dtype = df["date"].dtype
        if dtype in _STRING_TYPES:
            df = _parse_dates_multi_format(df)
        elif dtype == pl.Datetime:
            df = df.with_columns(pl.col("date").cast(pl.Date))
    return df


def _normalize_customer_names(df: pl.DataFrame) -> pl.DataFrame:
    return df.with_columns(
        pl.col("customer_id")
        .map_elements(normalize_customer_name, return_dtype=pl.Utf8)
        .fill_null("")
    )


def _clean_numerics(df: pl.DataFrame) -> pl.DataFrame:
    return df.with_columns([
        pl.col("revenue").cast(pl.Float64, strict=False).fill_null(0.0),
        pl.col("qty").cast(pl.Float64, strict=False).fill_null(1.0),
        pl.col("product_id").fill_null("Diversos"),
    ])


def _load_and_normalize(file_path: str) -> pl.DataFrame:
    """Loads a CSV/XLSX, normalises columns, validates required fields."""
    if file_path.endswith(".csv"):
        df = pl.read_csv(file_path, try_parse_dates=True)
    else:
        df = pl.read_excel(file_path)

    df = normalize_columns(df)

    missing = {"date", "customer_id", "revenue"} - set(df.columns)
    if missing:
        raise ValueError(f"Arquivo inválido. Colunas obrigatórias ausentes: {missing}")

    df = _ensure_optional_columns(df)
    df = _cast_types(df)
    df = _normalize_customer_names(df)
    df = df.drop_nulls(subset=["date"])
    df = _clean_numerics(df)

    # Data quality validation — fatal errors raise ValidationError (= ValueError, no retry)
    from data_engine.validators import validate_dataframe
    df, warnings = validate_dataframe(df)
    for w in warnings:
        logger.warning("etl.validation.warning", extra={"warning": w})

    return df


def _max_date(df: pl.DataFrame) -> date:
    raw = df["date"].max()
    if raw is None:
        return datetime.now().date()
    return raw.date() if isinstance(raw, datetime) else raw


# ─── Insights computation ─────────────────────────────────────────────────────

def generate_dynamic_insights(df: pl.DataFrame, date_range: str) -> dict | None:
    """
    Computes dashboard insights for a single date range from an in-memory DataFrame.
    Returns None when there is no data for the requested period.
    """
    if df.is_empty():
        return None

    max_date = _max_date(df)
    target_days = _DAYS_MAP.get(date_range, 180)

    start_date = max_date - timedelta(days=target_days)
    prev_start_date = start_date - timedelta(days=target_days)

    df_current = df.filter(pl.col("date") >= pl.lit(start_date).cast(pl.Date))
    df_prev = df.filter(
        (pl.col("date") >= pl.lit(prev_start_date).cast(pl.Date)) &
        (pl.col("date") < pl.lit(start_date).cast(pl.Date))
    )

    if df_current.is_empty():
        return None

    # ── KPIs ──────────────────────────────────────────────────────────────────
    total_revenue = float(df_current["revenue"].sum() or 0.0)
    prev_revenue = float(df_prev["revenue"].sum() or 0.0) if not df_prev.is_empty() else 0.0

    revenue_growth = 0.0
    if prev_revenue > 0:
        revenue_growth = round(((total_revenue - prev_revenue) / prev_revenue) * 100, 1)

    unique_customers = int(df_current["customer_id"].n_unique())
    unique_products = int(df_current["product_id"].n_unique())

    # Churned: clientes que não compram há mais de 60 dias (relativo ao max_date do dataset).
    # Usa o df completo para detectar todos os clientes inativos — não só os do período atual.
    # Para a janela curta (1m), df_current abrange apenas 30 dias e nunca conteria clientes
    # com última compra > 60 dias atrás, o que tornaria a lista de oportunidades vazia.
    limit_active = max_date - timedelta(days=60)
    churned_df = (
        df.group_by("customer_id").agg([
            pl.col("date").max().alias("ultima_compra"),
            pl.col("revenue").sum().alias("valor_total"),
        ])
        .filter(pl.col("ultima_compra") < pl.lit(limit_active).cast(pl.Date))
    )

    # KPI lost_revenue: receita dos clientes churned dentro do período atual
    churned_names = set(churned_df["customer_id"].to_list())
    lost_revenue_current = (
        df_current
        .filter(pl.col("customer_id").is_in(list(churned_names)))
        ["revenue"].sum() or 0.0
    ) if churned_names and not df_current.is_empty() else 0.0
    lost_revenue = float(lost_revenue_current)
    lost_rate = round((lost_revenue / total_revenue) * 100, 1) if total_revenue > 0 else 0.0

    # ── Customer distribution ─────────────────────────────────────────────────
    cust_curr = df_current.group_by("customer_id").agg(pl.col("revenue").sum().alias("curr"))
    if not df_prev.is_empty():
        cust_prev_agg = df_prev.group_by("customer_id").agg(pl.col("revenue").sum().alias("prev"))
        cust_trend = cust_curr.join(cust_prev_agg, on="customer_id", how="left").fill_null(0)
    else:
        cust_trend = cust_curr.with_columns(pl.lit(0).alias("prev"))

    def _trend(curr: float, prev: float) -> str:
        if prev == 0 and curr > 0: return "up"
        if curr > prev * 1.1: return "up"
        if curr < prev * 0.9: return "down"
        return "stable"

    customer_distribution = []
    for row in cust_trend.sort("curr", descending=True).head(10).iter_rows(named=True):
        norm = normalize_customer_name(row["customer_id"])
        safe_id = hashlib.md5(norm.encode("utf-8")).hexdigest()
        customer_distribution.append({
            "id": safe_id,
            "name": row["customer_id"],
            "value": float(row["curr"]),
            "percentage": round((row["curr"] / total_revenue) * 100, 1) if total_revenue > 0 else 0,
            "trend": _trend(float(row["curr"]), float(row["prev"])),
        })

    # ── Time series — "perdida" uses actual churned-customer revenue ──────────
    df_ts = df_current.with_columns(pl.col("date").dt.strftime("%b %Y").alias("month_str"))
    time_series_df = (
        df_ts.group_by("month_str").agg([
            pl.col("date").min().alias("month_order"),
            pl.col("revenue").sum().alias("receita"),
            pl.when(pl.col("customer_id").is_in(list(churned_names)))
              .then(pl.col("revenue")).otherwise(0.0).sum().alias("perdida"),
        ])
        .sort("month_order")
    )

    time_series = [
        {
            "month": row["month_str"],
            "receita": float(row["receita"]),
            "perdida": float(row["perdida"]),
        }
        for row in time_series_df.iter_rows(named=True)
    ]

    # ── Opportunities ─────────────────────────────────────────────────────────
    opportunities = [
        {
            "id": str(uuid.uuid4()),
            "customerHash": hashlib.md5(
                normalize_customer_name(str(row["customer_id"])).encode("utf-8")
            ).hexdigest(),
            "customer": row["customer_id"],
            "product": "Mix de Produtos",
            "type": "declining_customer",
            "lastPurchase": row["ultima_compra"].isoformat() if row["ultima_compra"] else None,
            "daysInactive": (max_date - row["ultima_compra"]).days if row["ultima_compra"] else 0,
            "frequency": "Mensal",
            "expectedValue": float(row["valor_total"] / 2),
            "confidence": "high" if row["valor_total"] > 1000 else "medium",
        }
        for row in churned_df.sort("valor_total", descending=True).head(15).iter_rows(named=True)
    ]

    # ── Seasonality — month vs. period average ───────────────────────────────
    seasonality = []
    if time_series:
        avg_revenue = sum(p["receita"] for p in time_series) / len(time_series)
        for p in time_series:
            atual_k = p["receita"] / 1000
            media_k = avg_revenue / 1000
            variacao = round(((p["receita"] - avg_revenue) / avg_revenue) * 100, 1) if avg_revenue > 0 else 0.0
            seasonality.append({
                "month": p["month"],
                "atual": round(atual_k, 1),
                "media": round(media_k, 1),
                "variacao": variacao,
            })

    # ── Product gaps — top products with declining revenue ───────────────────
    prod_curr = df_current.group_by("product_id").agg(pl.col("revenue").sum().alias("curr"))
    if not df_prev.is_empty():
        prod_prev = df_prev.group_by("product_id").agg(pl.col("revenue").sum().alias("prev"))
        prod_join = prod_curr.join(prod_prev, on="product_id", how="left").fill_null(0)
        product_gaps = [
            {
                "produto": str(row["product_id"]),
                "gap": round(float(row["prev"]) - float(row["curr"]), 2),
            }
            for row in prod_join.iter_rows(named=True)
            if float(row["prev"]) > float(row["curr"]) and float(row["prev"]) > 0
        ]
        product_gaps = sorted(product_gaps, key=lambda x: x["gap"], reverse=True)[:10]
    else:
        product_gaps = []

    return {
        "summary": {
            "totalRevenue": total_revenue,
            "lostRevenue": lost_revenue,
            "lostRate": lost_rate,
            "revenueGrowth": revenue_growth,
            "uniqueCustomers": unique_customers,
            "uniqueProducts": unique_products,
        },
        "opportunities": opportunities,
        "charts": {
            "timeSeries": time_series,
            "customerDistribution": customer_distribution,
            "productGaps": product_gaps,
            "seasonality": seasonality,
        },
    }


# ─── Customer profiles ────────────────────────────────────────────────────────

def build_customer_profiles(df: pl.DataFrame) -> list[dict]:
    """
    Computes aggregated per-customer profiles for the entire dataset.
    No individual transaction rows are stored — only metrics.
    """
    if df.is_empty():
        return []

    max_date = _max_date(df)
    total_company_revenue = float(df["revenue"].sum() or 0.0)

    # Batch aggregation for all customers at once
    customer_agg = df.group_by("customer_id").agg([
        pl.col("revenue").sum().alias("total_revenue"),
        pl.col("date").max().alias("last_purchase_date"),
        pl.col("date").n_unique().alias("frequency"),
    ])

    # Trend: last 3 months vs previous 3 months
    t_curr_start = max_date - timedelta(days=90)
    t_prev_start = t_curr_start - timedelta(days=90)

    rev_curr_df = (
        df.filter(pl.col("date") >= pl.lit(t_curr_start).cast(pl.Date))
        .group_by("customer_id").agg(pl.col("revenue").sum().alias("rev_curr"))
    )
    rev_prev_df = (
        df.filter(
            (pl.col("date") >= pl.lit(t_prev_start).cast(pl.Date)) &
            (pl.col("date") < pl.lit(t_curr_start).cast(pl.Date))
        )
        .group_by("customer_id").agg(pl.col("revenue").sum().alias("rev_prev"))
    )

    customer_agg = (
        customer_agg
        .join(rev_curr_df, on="customer_id", how="left")
        .join(rev_prev_df, on="customer_id", how="left")
        .fill_null(0)
    )

    profiles = []
    for row in customer_agg.iter_rows(named=True):
        cust_name = row["customer_id"]
        customer_hash = hashlib.md5(
            normalize_customer_name(str(cust_name)).encode("utf-8")
        ).hexdigest()

        total_rev = float(row["total_revenue"] or 0.0)
        last_date = row["last_purchase_date"]
        recency_days = (max_date - last_date).days if last_date else 0
        frequency = int(row["frequency"] or 1)
        percentage = round((total_rev / total_company_revenue) * 100, 1) if total_company_revenue > 0 else 0.0

        r_score = 5 if recency_days <= 30 else 4 if recency_days <= 60 else 3 if recency_days <= 90 else 2 if recency_days <= 180 else 1
        f_score = 5 if frequency >= 10 else 4 if frequency >= 5 else 3 if frequency >= 3 else 2 if frequency >= 2 else 1
        v_score = 5 if percentage > 5 else 4 if percentage > 2 else 3 if percentage > 1 else 2 if percentage > 0.5 else 1

        if r_score >= 4 and f_score >= 4:   segment = "champion"
        elif r_score >= 3 and f_score >= 3: segment = "loyal"
        elif r_score <= 2 and f_score >= 3: segment = "at_risk"
        elif r_score <= 2 and f_score <= 2: segment = "lost"
        else:                               segment = "new"

        rev_curr = float(row.get("rev_curr") or 0.0)
        rev_prev = float(row.get("rev_prev") or 0.0)
        if rev_prev == 0 and rev_curr > 0:  trend = "up"
        elif rev_curr > rev_prev * 1.1:     trend = "up"
        elif rev_curr < rev_prev * 0.9:     trend = "down"
        else:                               trend = "stable"

        # Per-customer aggregations
        df_cust = df.filter(pl.col("customer_id") == cust_name)

        top_prods = (
            df_cust.group_by("product_id").agg([
                pl.col("revenue").sum().alias("totalValue"),
                pl.col("qty").sum().alias("totalQuantity"),
            ])
            .sort("totalValue", descending=True).head(5)
        )
        top_products = [
            {
                "product": str(r["product_id"]),
                "totalValue": float(r["totalValue"] or 0.0),
                "totalQuantity": int(r["totalQuantity"] or 0),
                "percentage": round((float(r["totalValue"] or 0.0) / total_rev) * 100, 1) if total_rev > 0 else 0.0,
            }
            for r in top_prods.iter_rows(named=True)
        ]

        df_months = df_cust.with_columns(pl.col("date").dt.strftime("%b %Y").alias("month"))
        rev_hist = (
            df_months.group_by("month").agg([
                pl.col("date").min().alias("month_order"),
                pl.col("revenue").sum().alias("value"),
            ])
            .sort("month_order")
        )
        monthly_revenue = [
            {"month": str(r["month"]), "value": float(r["value"] or 0.0)}
            for r in rev_hist.iter_rows(named=True)
        ]

        alerts = []
        if segment == "at_risk":
            alerts.append({
                "id": str(uuid.uuid4()),
                "type": "declining_customer",
                "description": f"Cliente não compra há {recency_days} dias. Risco alto de perda (Churn).",
                "expectedValue": float(total_rev / max(frequency, 1)),
                "confidence": "high",
            })
        elif segment == "lost":
            alerts.append({
                "id": str(uuid.uuid4()),
                "type": "missing_sale",
                "description": "Cliente perdido. Tentar campanha de win-back agressiva com desconto.",
                "expectedValue": float(total_rev * 0.2),
                "confidence": "medium",
            })

        profiles.append({
            "customer_hash": customer_hash,
            "customer_name": cust_name,
            "total_revenue": total_rev,
            "percentage": percentage,
            "last_purchase_date": last_date.isoformat() if last_date else None,
            "recency_days": recency_days,
            "trend": trend,
            "segment": segment,
            "rfv": {
                "recency": recency_days,
                "frequency": frequency,
                "value": total_rev,
                "recencyScore": r_score,
                "frequencyScore": f_score,
                "valueScore": v_score,
                "segment": segment,
            },
            "top_products": top_products,
            "monthly_revenue": monthly_revenue,
            "alerts": alerts,
        })

    return profiles


# ─── Pipeline entry point ─────────────────────────────────────────────────────

def process_sales_pipeline(file_path: str, company_id: str) -> dict:
    """
    Loads the raw file, computes all insights and customer profiles entirely in
    memory. Does NOT persist any file or parquet — the caller (tasks.py) deletes
    the raw file in a finally block after this function returns.
    """
    df = _load_and_normalize(file_path)

    insights_by_range = {}
    for dr in DATE_RANGES:
        result = generate_dynamic_insights(df, dr)
        if result is not None:
            insights_by_range[dr] = result

    customer_profiles = build_customer_profiles(df)

    # Summary stats for AnalysisResult (backward-compatible)
    total_revenue = float(df["revenue"].sum() or 0.0)
    max_date = _max_date(df)
    limit_active = max_date - timedelta(days=60)
    churned = (
        df.group_by("customer_id").agg([
            pl.col("date").max().alias("ultima_compra"),
            pl.col("revenue").sum().alias("total_revenue"),
        ])
        .filter(pl.col("ultima_compra") < pl.lit(limit_active).cast(pl.Date))
    )

    return {
        "total_revenue": total_revenue,
        "lost_revenue": float(churned["total_revenue"].sum() or 0.0) if not churned.is_empty() else 0.0,
        "opportunities_count": len(churned),
        "unique_customers": int(df["customer_id"].n_unique()),
        "unique_products": int(df["product_id"].n_unique()),
        "insights_by_range": insights_by_range,
        "customer_profiles": customer_profiles,
    }
