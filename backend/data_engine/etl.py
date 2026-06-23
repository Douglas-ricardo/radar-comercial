# data_engine/etl.py
import hashlib
import logging
import os
import unicodedata
import uuid
from datetime import date, datetime, timedelta

import polars as pl

from ml.inference import assess_churn_risk  # modelo treinado se existir; senão heurística (ml/churn.py)

logger = logging.getLogger(__name__)

# ─── Column normalisation ─────────────────────────────────────────────────────

CANONICAL_COLUMNS = {
    "data": "date", "data_venda": "date", "data da venda": "date", "date": "date",
    "data_pedido": "date", "data_nota": "date", "emissao": "date",
    "cliente": "customer_id", "customer": "customer_id", "nome": "customer_id",
    "comprador": "customer_id", "customer_id": "customer_id", "razao_social": "customer_id",
    "razao social": "customer_id", "nome_cliente": "customer_id",
    "produto": "product_id", "product": "product_id", "item": "product_id",
    "servico": "product_id", "product_id": "product_id", "descricao": "product_id",
    "descricao_produto": "product_id", "sku": "product_id", "cod_produto": "product_id",
    "quantidade": "qty", "qty": "qty", "qtd": "qty", "quant": "qty", "qtde": "qty",
    "valor": "revenue", "revenue": "revenue", "preco": "revenue", "total": "revenue",
    "valor_total": "revenue", "receita": "revenue", "faturamento": "revenue",
    "preco_total": "revenue", "vlr_total": "revenue",
    # Contato do cliente final (opcional) — habilita disparo WhatsApp/email
    "telefone": "phone", "celular": "phone", "whatsapp": "phone", "fone": "phone",
    "phone": "phone", "contato": "phone", "tel": "phone",
    "email": "email", "e-mail": "email", "e_mail": "email", "mail": "email",
    # Identificador fiscal (opcional) — B2B: CNPJ/CPF do cliente
    "cnpj": "document_id", "cpf": "document_id", "documento": "document_id",
    "document": "document_id", "doc": "document_id", "cnpj_cpf": "document_id",
    "nr_cnpj": "document_id", "nr_cpf": "document_id",
    # Filial / unidade de negócio (opcional) — redes, franquias, distribuidoras
    "filial": "branch", "unidade": "branch", "loja": "branch", "branch": "branch",
    "store": "branch", "unidade_negocio": "branch", "cod_filial": "branch",
    "nome_filial": "branch", "regional": "branch",
    # Vendedor responsável (opcional) — carteiras por representante
    "vendedor": "salesperson", "representante": "salesperson", "salesperson": "salesperson",
    "rep": "salesperson", "consultor": "salesperson", "agente": "salesperson",
    "nome_vendedor": "salesperson", "cod_vendedor": "salesperson",
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
    Em empate, vence o primeiro da lista (BR `%d/%m/%Y`) — coerente com o público.
    Quando BR e US (`%m/%d/%Y`) empatam, há ambiguidade real (ex.: "05/03/2024"):
    mantemos o BR mas registramos aviso, pois algumas datas podem estar trocadas.
    """
    best_series = None
    best_nulls = None
    nulls_by_fmt = {}
    for fmt in _DATE_FORMATS:
        parsed = df["date"].str.to_date(fmt, strict=False)
        nulls = parsed.null_count()
        nulls_by_fmt[fmt] = nulls
        if best_nulls is None or nulls < best_nulls:
            best_series = parsed
            best_nulls = nulls

    # Ambiguidade BR×US: ambos parseiam o mesmo nº de linhas → datas com dia<=12
    # podem ter sido interpretadas como mês. Avisa (não bloqueia).
    if nulls_by_fmt.get("%d/%m/%Y") == nulls_by_fmt.get("%m/%d/%Y") and best_nulls is not None:
        total = df.height
        if best_nulls < total:  # houve parsing efetivo
            logger.warning(
                "etl.dates.ambiguous_format",
                extra={"chosen": "%d/%m/%Y", "note": "BR e US empataram; assumindo dd/mm"},
            )
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


def prettify_customer_name(name: str) -> str:
    """
    Nome para exibição: preserva acentos e capitalização original. Apenas
    normaliza espaços e corrige caixa quando o nome vem todo em maiúsculas ou
    todo em minúsculas (ex.: "JOÃO DA SILVA" / "joão da silva" → "João Da Silva").
    Casos mistos (ex.: "iFood", "McDonald's") são preservados como vieram.
    """
    if not name:
        return ""
    s = " ".join(str(name).split())
    if s and (s == s.upper() or s == s.lower()):
        return s.title()
    return s


def _normalize_customer_names(df: pl.DataFrame) -> pl.DataFrame:
    # Mantém o nome original (prettificado) para exibição em `customer_display`
    # e a versão normalizada em `customer_id` para agrupamento/hash.
    return df.with_columns(
        pl.col("customer_id")
        .map_elements(prettify_customer_name, return_dtype=pl.Utf8)
        .fill_null("")
        .alias("customer_display")
    ).with_columns(
        pl.col("customer_id")
        .map_elements(normalize_customer_name, return_dtype=pl.Utf8)
        .fill_null("")
    )


def _build_display_map(df: pl.DataFrame) -> dict:
    """Mapa normalizado→nome de exibição. Se faltar a coluna, retorna vazio."""
    if "customer_display" not in df.columns:
        return {}
    return dict(zip(df["customer_id"].to_list(), df["customer_display"].to_list()))


def normalize_phone_br(raw) -> str | None:
    """
    Normaliza telefone para E.164 brasileiro (+55DDNNNNNNNNN), best-effort.
    Aceita "(11) 98238-7185", "11982387185", "5511982387185", "+55 11 98238-7185".
    Retorna None se não houver dígitos suficientes para ser um número válido.
    """
    if raw is None:
        return None
    digits = "".join(ch for ch in str(raw) if ch.isdigit())
    if not digits:
        return None
    # já vem com DDI 55
    if digits.startswith("55") and len(digits) in (12, 13):
        return f"+{digits}"
    # número nacional com DDD (10 = fixo, 11 = celular)
    if len(digits) in (10, 11):
        return f"+55{digits}"
    # internacional fora do BR — só aceita dentro do tamanho válido de E.164 (8–15)
    if 11 <= len(digits) <= 15:
        return f"+{digits}"
    # qualquer outra coisa (muito curto/longo) é inválido → não envia
    return None


def _clean_email(raw) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip().lower()
    return s if "@" in s and "." in s.split("@")[-1] else None


def _build_contact_map(df: pl.DataFrame) -> dict:
    """
    Mapa customer_id(normalizado) → {phone, email} usando o registro mais recente
    com contato preenchido. Telefone normalizado para E.164. Vazio se sem colunas.
    """
    has_phone = "phone" in df.columns
    has_email = "email" in df.columns
    if not has_phone and not has_email:
        return {}

    cols = ["customer_id", "date"]
    if has_phone:
        cols.append("phone")
    if has_email:
        cols.append("email")

    # ordena por data desc para o primeiro não-nulo por cliente ser o mais recente
    sub = df.select(cols).sort("date", descending=True)
    contacts: dict = {}
    for row in sub.iter_rows(named=True):
        cid = row["customer_id"]
        entry = contacts.setdefault(cid, {"phone": None, "email": None})
        if has_phone and entry["phone"] is None:
            entry["phone"] = normalize_phone_br(row.get("phone"))
        if has_email and entry["email"] is None:
            entry["email"] = _clean_email(row.get("email"))
    return contacts


def _clean_numerics(df: pl.DataFrame) -> pl.DataFrame:
    return df.with_columns([
        pl.col("revenue").cast(pl.Float64, strict=False).fill_null(0.0),
        pl.col("qty").cast(pl.Float64, strict=False).fill_null(1.0),
        pl.col("product_id").fill_null("Diversos"),
    ])


def _load_and_normalize(file_path: str) -> pl.DataFrame:
    """
    Loads a CSV/XLSX, selects only canonical columns (column pushdown for CSVs),
    normalises, validates required fields and returns an in-memory DataFrame.
    """
    if file_path.endswith(".csv"):
        # scan_csv reads the header without loading data → build rename map cheaply.
        lf = pl.scan_csv(file_path, try_parse_dates=False, infer_schema_length=10_000)
        raw_cols = lf.columns  # header only — no data loaded yet

        rename_map = {
            c: CANONICAL_COLUMNS[c.lower().strip()]
            for c in raw_cols
            if c.lower().strip() in CANONICAL_COLUMNS
        }
        # Select only columns we care about (column pushdown → reads less data from disk).
        cols_to_read = [c for c in raw_cols if c.lower().strip() in CANONICAL_COLUMNS]
        if cols_to_read:
            lf = lf.select(cols_to_read)
        if rename_map:
            lf = lf.rename(rename_map)
        df = lf.collect()
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

    display_map = _build_display_map(df)
    file_max = _max_date(df)
    today = datetime.now().date()
    # Guard: se o arquivo está defasado (>7 dias), medir churn contra o próprio arquivo
    # para evitar que todo cliente vire "inativo" quando o CSV é histórico.
    reference_date = today if (today - file_max).days <= 7 else file_max
    data_freshness = "live" if reference_date == today else file_max.strftime("até %d/%m/%Y")

    max_date = file_max  # mantido para cálculo das janelas de período
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

    # Churned: clientes que não compram há mais de 60 dias relativo a reference_date.
    # reference_date = hoje se o arquivo é recente (≤7d), senão = max_date do arquivo.
    # Usa o df completo para detectar todos os clientes inativos — não só os do período atual.
    limit_active = reference_date - timedelta(days=60)

    # Enriquecimento por cliente: último produto, n_purchases, avg_ticket, avg_interval
    last_product_df = (
        df.sort("date", descending=True)
        .group_by("customer_id")
        .first()
        .select(["customer_id", pl.col("product_id").alias("last_product")])
    )
    customer_agg = df.group_by("customer_id").agg([
        pl.col("date").max().alias("ultima_compra"),
        pl.col("date").min().alias("primeira_compra"),
        pl.col("revenue").sum().alias("valor_total"),
        pl.col("revenue").count().alias("n_purchases"),
        pl.col("revenue").mean().alias("avg_ticket"),
    ])
    churned_df = (
        customer_agg
        .filter(pl.col("ultima_compra") < pl.lit(limit_active).cast(pl.Date))
        .join(last_product_df, on="customer_id", how="left")
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
            "name": display_map.get(row["customer_id"], row["customer_id"]),
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
    def _frequency_label(n_purchases: int, primeira_compra, ultima_compra) -> str:
        if n_purchases <= 1 or primeira_compra is None or ultima_compra is None:
            return "Esporádico"
        span = (ultima_compra - primeira_compra).days
        avg_days = span / (n_purchases - 1) if n_purchases > 1 else span
        if avg_days < 14:
            return "Semanal"
        if avg_days < 21:
            return "Quinzenal"
        if avg_days < 45:
            return "Mensal"
        if avg_days < 75:
            return "Bimestral"
        return "Esporádico"

    opportunities = [
        {
            "id": str(uuid.uuid4()),
            "customerHash": hashlib.md5(
                normalize_customer_name(str(row["customer_id"])).encode("utf-8")
            ).hexdigest(),
            "customer": display_map.get(row["customer_id"], row["customer_id"]),
            "product": str(row["last_product"]) if row.get("last_product") else "Produto não identificado",
            "type": "declining_customer",
            "lastPurchase": row["ultima_compra"].isoformat() if row["ultima_compra"] else None,
            "daysInactive": (reference_date - row["ultima_compra"]).days if row["ultima_compra"] else 0,
            "frequency": _frequency_label(
                row.get("n_purchases", 1), row.get("primeira_compra"), row["ultima_compra"]
            ),
            "expectedValue": round(float(row.get("avg_ticket", 0) or 0), 2),
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
            "dataFreshness": data_freshness,
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

def _build_extra_fields_map(df: pl.DataFrame) -> dict:
    """
    Builds a map customer_id → {document_id, branch, salesperson} using the
    most recent non-null value per field per customer. O(n) single pass.
    """
    extra_cols = [c for c in ("document_id", "branch", "salesperson") if c in df.columns]
    if not extra_cols:
        return {}
    sub = df.select(["customer_id", "date"] + extra_cols).sort("date", descending=True)
    result: dict = {}
    for row in sub.iter_rows(named=True):
        cid = row["customer_id"]
        entry = result.setdefault(cid, {k: None for k in extra_cols})
        for col in extra_cols:
            if entry[col] is None:
                val = row.get(col)
                if val is not None:
                    s = str(val).strip()
                    entry[col] = s or None
    return result


def build_customer_profiles(df: pl.DataFrame, cycle_days: int = 90) -> list[dict]:
    """
    Computes aggregated per-customer profiles for the entire dataset.
    Uses batch aggregations (O(n)) instead of per-customer DataFrame filters (O(n²)).
    No individual transaction rows are stored — only metrics.
    """
    if df.is_empty():
        return []

    display_map = _build_display_map(df)
    contact_map = _build_contact_map(df)
    extra_map = _build_extra_fields_map(df)
    max_date = _max_date(df)
    total_company_revenue = float(df["revenue"].sum() or 0.0)

    # ── Batch aggregation for all customers ──────────────────────────────────
    customer_agg = df.group_by("customer_id").agg([
        pl.col("revenue").sum().alias("total_revenue"),
        pl.col("date").max().alias("last_purchase_date"),
        pl.col("date").min().alias("first_purchase_date"),
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

    # ── Pre-compute top products per customer (replaces O(n²) per-customer filter) ──
    top_prods_agg = (
        df.group_by(["customer_id", "product_id"])
        .agg([
            pl.col("revenue").sum().alias("totalValue"),
            pl.col("qty").sum().alias("totalQuantity"),
        ])
        .sort(["customer_id", "totalValue"], descending=[False, True])
    )
    top_prods_by_customer: dict = {}
    for row in top_prods_agg.iter_rows(named=True):
        cid = row["customer_id"]
        lst = top_prods_by_customer.setdefault(cid, [])
        if len(lst) < 5:
            lst.append({
                "product": str(row["product_id"]),
                "totalValue": float(row["totalValue"] or 0.0),
                "totalQuantity": int(row["totalQuantity"] or 0),
            })

    # ── Pre-compute monthly revenue per customer ────────────────────────────
    monthly_agg = (
        df.with_columns([
            pl.col("date").dt.strftime("%b %Y").alias("_month_str"),
            pl.col("date").dt.strftime("%Y-%m").alias("_month_order"),
        ])
        .group_by(["customer_id", "_month_str", "_month_order"])
        .agg(pl.col("revenue").sum().alias("value"))
        .sort(["customer_id", "_month_order"])
    )
    monthly_by_customer: dict = {}
    for row in monthly_agg.iter_rows(named=True):
        cid = row["customer_id"]
        monthly_by_customer.setdefault(cid, []).append({
            "month": str(row["_month_str"]),
            "value": float(row["value"] or 0.0),
        })

    # ── Main loop — O(customers), no per-customer DataFrame filter ───────────
    profiles = []
    for row in customer_agg.iter_rows(named=True):
        cust_name = row["customer_id"]
        customer_hash = hashlib.md5(
            normalize_customer_name(str(cust_name)).encode("utf-8")
        ).hexdigest()

        total_rev = float(row["total_revenue"] or 0.0)
        last_date = row["last_purchase_date"]
        first_date = row["first_purchase_date"]
        recency_days = (max_date - last_date).days if last_date else 0
        frequency = int(row["frequency"] or 1)
        percentage = round((total_rev / total_company_revenue) * 100, 1) if total_company_revenue > 0 else 0.0

        span_days = (last_date - first_date).days if (last_date and first_date) else 0
        avg_interval_days = round(span_days / (frequency - 1), 1) if frequency > 1 and span_days > 0 else 0.0
        churn = assess_churn_risk(recency_days, avg_interval_days, frequency, cycle_days=cycle_days)

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

        # Top products (pre-computed, no per-customer filter)
        raw_prods = top_prods_by_customer.get(cust_name, [])
        top_products = [
            {**p, "percentage": round((p["totalValue"] / total_rev) * 100, 1) if total_rev > 0 else 0.0}
            for p in raw_prods
        ]

        monthly_revenue = monthly_by_customer.get(cust_name, [])

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

        contact = contact_map.get(cust_name, {})
        extra = extra_map.get(cust_name, {})
        profiles.append({
            "customer_hash": customer_hash,
            "customer_name": display_map.get(cust_name, cust_name),
            "phone": contact.get("phone"),
            "email": contact.get("email"),
            "document_id": extra.get("document_id"),
            "branch": extra.get("branch"),
            "salesperson": extra.get("salesperson"),
            "total_revenue": total_rev,
            "percentage": percentage,
            "last_purchase_date": last_date.isoformat() if last_date else None,
            "recency_days": recency_days,
            "avg_interval_days": avg_interval_days,
            "churn_risk": churn["risk"],
            "churn_score": churn["score"],
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

def process_sales_pipeline(file_path: str, company_id: str, cycle_days: int = 90) -> dict:
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

    customer_profiles = build_customer_profiles(df, cycle_days=cycle_days)

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
