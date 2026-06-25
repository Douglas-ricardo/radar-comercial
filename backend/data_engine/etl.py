# data_engine/etl.py
import hashlib
import logging
import os
import re
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
    "quantity": "qty",
    "valor": "revenue", "revenue": "revenue", "preco": "revenue", "total": "revenue",
    "valor_total": "revenue", "receita": "revenue", "faturamento": "revenue",
    "preco_total": "revenue", "vlr_total": "revenue", "value": "revenue",
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


def _canon_key(col: str) -> str:
    """Normaliza nome de coluna p/ casar com CANONICAL_COLUMNS de forma robusta."""
    c = col.strip().lower()
    c = re.sub(r"\(.*?\)", "", c)           # remove "(r$)", "(un)"
    c = re.sub(r"[\s\-]+", "_", c.strip())  # "data venda" -> "data_venda"
    c = re.sub(r"_+", "_", c).strip("_")    # colapsa underscores
    return c


def _build_rename_map(cols) -> dict:
    """
    Mapeia colunas ORIGINAIS → canônicas via _canon_key. Guard de colisão: se duas
    colunas normalizam para a mesma canônica (ex.: "Valor" e "Valor Total" → revenue),
    mantém só a primeira — o polars quebraria o rename com nomes-alvo duplicados.
    As chaves do dict são os nomes originais, o que preserva o column-pushdown do CSV.
    """
    rename_map: dict[str, str] = {}
    seen_targets: set[str] = set()
    for c in cols:
        canonical = CANONICAL_COLUMNS.get(_canon_key(c))
        if canonical is None:
            continue
        if canonical in seen_targets:
            logger.warning(
                "etl.header.collision",
                extra={"ignored_column": c, "canonical": canonical},
            )
            continue
        seen_targets.add(canonical)
        rename_map[c] = canonical
    return rename_map


def normalize_columns(df: pl.DataFrame) -> pl.DataFrame:
    rename_map = _build_rename_map(df.columns)
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


# Formatos de data tentados em ordem — a ordem define a precedência em datas
# ambíguas (BR `%d/%m/%Y` antes de US `%m/%d/%Y`).
_DATE_FORMATS = ["%d/%m/%Y", "%Y-%m-%d", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"]

# Acima deste limiar de datas não reconhecidas, aborta em vez de descartar calado.
# (decisão de produto — ajuste ao apetite de risco)
_DATE_NULL_THRESHOLD = 0.30


def _parse_dates_multi_format(df: pl.DataFrame) -> pl.DataFrame:
    """
    Coalesce de TODOS os formatos por linha: permite formatos mistos no mesmo
    arquivo (ISO + dd/mm/yyyy + ...). A ordem de _DATE_FORMATS define a precedência
    em datas ambíguas (BR antes de US). Aborta se a perda de linhas exceder
    _DATE_NULL_THRESHOLD em vez de descartar metade do arquivo em silêncio.
    """
    total = df.height
    if total == 0:
        return df

    # nulls por formato — só para o AVISO de ambiguidade (não escolhe vencedor)
    nulls_by_fmt = {
        fmt: df["date"].str.to_date(fmt, strict=False).null_count()
        for fmt in _DATE_FORMATS
    }

    # coalesce: cada linha recupera o 1º formato de _DATE_FORMATS que a parsear
    attempts = [pl.col("date").str.to_date(fmt, strict=False) for fmt in _DATE_FORMATS]
    df = df.with_columns(pl.coalesce(attempts).alias("date"))

    nulls = df["date"].null_count()
    loss = nulls / total
    if loss > _DATE_NULL_THRESHOLD:
        raise ValueError(
            f"{nulls} de {total} datas ({loss:.0%}) não reconhecidas. "
            f"Verifique a coluna de data. Formatos aceitos: {', '.join(_DATE_FORMATS)}."
        )
    if nulls > 0:
        logger.warning(
            "etl.dates.dropped",
            extra={"dropped": nulls, "total": total, "rate": round(loss, 3)},
        )

    # Ambiguidade BR×US: ambos parseiam o mesmo nº de linhas → datas com dia<=12
    # podem ter sido interpretadas como mês. Avisa (não bloqueia).
    if nulls_by_fmt.get("%d/%m/%Y") == nulls_by_fmt.get("%m/%d/%Y") and nulls < total:
        logger.warning(
            "etl.dates.ambiguous_format",
            extra={"chosen": "%d/%m/%Y", "note": "BR e US empataram; assumindo dd/mm"},
        )
    return df


def _clean_money_str(s: str | None) -> float | None:
    """
    Converte um valor monetário em string para float detectando o formato POR VALOR.
    Suporta BR e US/internacional misturados no mesmo arquivo:
      - Tem vírgula → decimal BR: pontos são milhar, vírgula é decimal.
        "1.234,56" → 1234.56 ; "1.234.567,89" → 1234567.89
      - Sem vírgula, com ponto → ponto JÁ é decimal (US): NÃO remover.
        "3706.29" → 3706.29 (NÃO 370629)
      - Sem separador → inteiro puro. "1500" → 1500.0
    """
    if s is None:
        return None
    t = re.sub(r"[R$\s]", "", str(s)).strip()
    if t == "":
        return None
    if "," in t:
        # decimal BR: pontos são milhar, vírgula é decimal
        t = t.replace(".", "").replace(",", ".")
    # senão: ponto (se houver) já é decimal — não mexer
    try:
        return float(t)
    except ValueError:
        return None


def _cast_types(df: pl.DataFrame) -> pl.DataFrame:
    if "revenue" in df.columns and df["revenue"].dtype in _STRING_TYPES:
        df = df.with_columns(
            pl.col("revenue")
            .map_elements(_clean_money_str, return_dtype=pl.Float64)
            .alias("revenue")
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

        rename_map = _build_rename_map(raw_cols)
        # Select only columns we care about (column pushdown → reads less data from disk).
        # As chaves do rename_map são os nomes ORIGINAIS, então preservam o pushdown.
        cols_to_read = list(rename_map.keys())
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


# ─── Fonte de verdade: status e valor recuperável do cliente ──────────────────

# Limiares de status como múltiplos do ciclo efetivo do cliente.
_AT_RISK_MULT = 1.0   # recency > 1.0× ciclo  → atrasado (proativo)
_CHURNED_MULT = 1.5   # recency > 1.5× ciclo  → sumiu (win-back)
_MIN_PURCHASES_FOR_RHYTHM = 3  # abaixo disso, usa ciclo global, não o individual


def effective_cycle_days(avg_interval_days: float, frequency: int, cycle_days: int) -> float:
    """Ciclo do PRÓPRIO cliente quando há ritmo confiável; senão, o global da empresa."""
    if frequency >= _MIN_PURCHASES_FOR_RHYTHM and avg_interval_days and avg_interval_days > 0:
        return float(avg_interval_days)
    return float(cycle_days)


def recoverable_value(total_revenue: float, span_days: int, eff_cycle: float) -> float:
    """
    Valor recuperável = receita por CICLO típico do cliente (fluxo que volta ao reativar),
    não ticket avulso. Substitui avg_ticket / total_rev*0.2 / total_rev/frequency.
    """
    if total_revenue <= 0:
        return 0.0
    n_cycles = max(1, round(span_days / eff_cycle)) if eff_cycle > 0 else 1
    return round(total_revenue / n_cycles, 2)


def classify_customer_status(
    recency_days: int,
    avg_interval_days: float,
    frequency: int,
    total_revenue: float,
    span_days: int,
    cycle_days: int = 90,
) -> dict:
    """
    ÚNICA fonte de verdade para status comercial e valor recuperável.
    Consumida por generate_dynamic_insights E build_customer_profiles.

    Retorna:
      status: "active" | "at_risk" | "churned"
      expected_value: receita por ciclo (régua única)
      eff_cycle: ciclo efetivo usado (para debug/exibição)
      days_overdue: dias além do ciclo efetivo (0 se em dia)
    """
    eff_cycle = effective_cycle_days(avg_interval_days, frequency, cycle_days)
    expected_value = recoverable_value(total_revenue, span_days, eff_cycle)
    days_overdue = max(0, int(round(recency_days - eff_cycle)))

    if recency_days > eff_cycle * _CHURNED_MULT:
        status = "churned"
    elif recency_days > eff_cycle * _AT_RISK_MULT:
        status = "at_risk"
    else:
        status = "active"

    return {
        "status": status,
        "expected_value": expected_value,
        "eff_cycle": round(eff_cycle, 1),
        "days_overdue": days_overdue,
    }


# ─── Score de recuperabilidade (regras, explicável — NÃO é ML/probabilidade) ──

# Pesos do recovery_score (somam 100). HIPÓTESE versionada — calibrar com dado real.
_RS_W_RECENCY     = 40  # recência relativa ao ciclo (fator dominante)
_RS_W_REGULARITY  = 25  # regularidade do ritmo de compra
_RS_W_TREND       = 20  # tendência antes de sumir (já caía vs sumiu saudável)
_RS_W_DEPTH       = 15  # profundidade da relação (nº compras + span)

_RS_HIGH = 70  # >= alta
_RS_MED  = 40  # >= média ; abaixo = baixa

# Divisor da curva de recência: f_recency cai a 0 quando recency = (1 + span) ciclos.
# Maior = decaimento mais lento (segura melhor a faixa 1–2.5 ciclos, ainda recuperável).
_RS_RECENCY_SPAN = 3.5

# Janela (dias) para medir a tendência ANTES da última compra (pré-saída).
_RS_TREND_WINDOW = 90


def purchase_regularity(dates: list) -> float:
    """
    Regularidade do ritmo de compra, em [0, 1] (1 = perfeitamente regular).
    Baseado no coeficiente de variação (CV) dos intervalos entre compras consecutivas:
    regularity = 1 / (1 + CV), onde CV = desvio_padrão(gaps) / média(gaps).
    < 2 compras → 0.0 (sem ritmo aferível).
    """
    if not dates or len(dates) < 2:
        return 0.0
    gaps = [(dates[i] - dates[i - 1]).days for i in range(1, len(dates))]
    gaps = [g for g in gaps if g > 0]
    if len(gaps) < 1:
        return 0.0
    mean = sum(gaps) / len(gaps)
    if mean <= 0:
        return 0.0
    var = sum((g - mean) ** 2 for g in gaps) / len(gaps)
    std = var ** 0.5
    cv = std / mean
    return round(1.0 / (1.0 + cv), 4)


def recovery_score(
    recency_days: int,
    eff_cycle: float,
    regularity: float,      # 0..1 (purchase_regularity)
    rev_recent: float,      # receita na janela ANTES da última compra (recente)
    rev_before: float,      # receita na janela anterior a essa (base de comparação)
    frequency: int,
    span_days: int,
) -> dict:
    """
    Score de recuperabilidade 0-100 + faixa + motivos. Baseado em regras, transparente.
    NÃO é probabilidade estatística — é um índice ordenável e explicável.

    A tendência (rev_recent vs rev_before) mede o comportamento ANTES de sumir — se o
    cliente já declinava enquanto ainda comprava (recuperação difícil) ou sumiu saudável.
    """
    reasons = []

    # Fator 1 — recência relativa ao ciclo. 1.0 no ciclo, decaimento suave por múltiplos;
    # zera só perto de ~(1 + _RS_RECENCY_SPAN) ciclos. Segura a faixa 1–2.5 (ainda recuperável).
    if eff_cycle > 0:
        ratio = recency_days / eff_cycle           # 1.0 = saiu há 1 ciclo
        f_recency = max(0.0, min(1.0, 1.0 - (max(0.0, ratio - 1.0) / _RS_RECENCY_SPAN)))
    else:
        f_recency = 0.0
    if f_recency >= 0.6:
        reasons.append("saiu há pouco tempo relativo ao ciclo dele")
    elif f_recency <= 0.25:
        reasons.append("sumiu há vários ciclos (difícil reativar)")

    # Fator 2 — regularidade (já 0..1).
    f_reg = max(0.0, min(1.0, regularity))
    if f_reg >= 0.7:
        reasons.append("cliente comprava em ritmo regular")
    elif f_reg <= 0.3 and frequency >= 2:
        reasons.append("padrão de compra irregular")

    # Fator 3 — tendência pré-saída. Caindo antes de sumir = pior; sumiu saudável = melhor.
    if rev_before > 0:
        change = (rev_recent - rev_before) / rev_before
        f_trend = max(0.0, min(1.0, 0.5 + change))  # estável=0.5, queda<0.5, alta>0.5
    else:
        f_trend = 0.5  # sem base de comparação → neutro
    if f_trend <= 0.3:
        reasons.append("já vinha desacelerando antes de parar")
    elif f_trend >= 0.7:
        reasons.append("sumiu sem dar sinais (vinha saudável)")

    # Fator 4 — profundidade da relação (compras + span normalizados, saturando).
    f_depth = max(0.0, min(1.0, (min(frequency, 12) / 12) * 0.6 + (min(span_days, 540) / 540) * 0.4))
    if f_depth >= 0.7:
        reasons.append("relação longa e consolidada")

    score = (
        _RS_W_RECENCY    * f_recency +
        _RS_W_REGULARITY * f_reg +
        _RS_W_TREND      * f_trend +
        _RS_W_DEPTH      * f_depth
    )
    score = int(round(max(0.0, min(100.0, score))))

    band = "alta" if score >= _RS_HIGH else "media" if score >= _RS_MED else "baixa"

    return {
        "recoveryScore": score,
        "recoveryBand": band,            # "alta" | "media" | "baixa"
        "recoveryReasons": reasons[:3],  # até 3 motivos, ordem de relevância
        "recoveryFactors": {             # para debug/tooltip/transparência
            "recency": round(f_recency, 3),
            "regularity": round(f_reg, 3),
            "trend": round(f_trend, 3),
            "depth": round(f_depth, 3),
        },
    }


def _dates_by_customer(df: pl.DataFrame) -> dict:
    """
    Mapa customer_id → lista ordenada de datas DISTINTAS de compra. Fonte única para
    a regularidade (purchase_regularity), consumida por insights e profiles. O(n).
    """
    dates_agg = (
        df.select(["customer_id", "date"]).unique()
        .group_by("customer_id")
        .agg(pl.col("date").sort().alias("_dates"))
    )
    return {r["customer_id"]: list(r["_dates"]) for r in dates_agg.iter_rows(named=True)}


def _pre_lpd_trend_maps(df: pl.DataFrame, window: int = _RS_TREND_WINDOW) -> tuple[dict, dict]:
    """
    Tendência pré-saída em BATCH (O(n), sem filtro por cliente em loop). Para cada cliente,
    com base na sua última compra (LPD):
      rev_recent = soma revenue em [LPD - window, LPD]
      rev_before = soma revenue em [LPD - 2*window, LPD - window)
    Fonte única alimentada pela lista de oportunidades E pelo perfil → recovery_score idêntico.
    Retorna (rev_recent_map, rev_before_map).
    """
    lpd = df.group_by("customer_id").agg(pl.col("date").max().alias("_lpd"))
    j = (
        df.join(lpd, on="customer_id", how="left")
        .with_columns([
            pl.col("_lpd").dt.offset_by(f"-{window}d").alias("_w1"),
            pl.col("_lpd").dt.offset_by(f"-{2 * window}d").alias("_w2"),
        ])
        .group_by("customer_id")
        .agg([
            pl.when((pl.col("date") >= pl.col("_w1")) & (pl.col("date") <= pl.col("_lpd")))
              .then(pl.col("revenue")).otherwise(0.0).sum().alias("rev_recent"),
            pl.when((pl.col("date") >= pl.col("_w2")) & (pl.col("date") < pl.col("_w1")))
              .then(pl.col("revenue")).otherwise(0.0).sum().alias("rev_before"),
        ])
    )
    recent_map: dict = {}
    before_map: dict = {}
    for r in j.iter_rows(named=True):
        recent_map[r["customer_id"]] = float(r["rev_recent"] or 0.0)
        before_map[r["customer_id"]] = float(r["rev_before"] or 0.0)
    return recent_map, before_map


# ─── Insights computation ─────────────────────────────────────────────────────

def generate_dynamic_insights(df: pl.DataFrame, date_range: str, cycle_days: int = 90) -> dict | None:
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

    # ── Status comercial (fonte de verdade única) ───────────────────────────
    # classify_customer_status decide status e valor recuperável para CADA cliente
    # do histórico completo (não só do período atual). Oportunidade = at_risk|churned;
    # `active` nunca entra. Mesma régua consumida por build_customer_profiles.
    last_product_df = (
        df.sort("date", descending=True)
        .group_by("customer_id")
        .first()
        .select(["customer_id", pl.col("product_id").alias("last_product")])
    )
    customer_agg = (
        df.group_by("customer_id").agg([
            pl.col("date").max().alias("ultima_compra"),
            pl.col("date").min().alias("primeira_compra"),
            pl.col("revenue").sum().alias("valor_total"),
            pl.col("date").n_unique().alias("n_purchases"),
        ])
        .join(last_product_df, on="customer_id", how="left")
    )

    # Sinais do recovery_score (fonte única): regularidade dos gaps + tendência pré-saída.
    dates_by_customer = _dates_by_customer(df)
    _rev_recent_map, _rev_before_map = _pre_lpd_trend_maps(df)

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

    opportunities = []
    churned_names: set = set()
    lost_revenue = 0.0
    for row in customer_agg.iter_rows(named=True):
        ultima = row["ultima_compra"]
        primeira = row["primeira_compra"]
        n_purchases = int(row["n_purchases"] or 1)
        valor_total = float(row["valor_total"] or 0.0)
        recency = (reference_date - ultima).days if ultima else 0
        span = (ultima - primeira).days if (ultima and primeira) else 0
        avg_interval = span / (n_purchases - 1) if n_purchases > 1 and span > 0 else 0.0
        st = classify_customer_status(
            recency, avg_interval, n_purchases, valor_total, span, cycle_days=cycle_days
        )
        if st["status"] == "churned":
            churned_names.add(row["customer_id"])
            lost_revenue += st["expected_value"]
        if st["status"] not in ("at_risk", "churned"):
            continue
        # confidence derivado de sinal real (histórico), não string fixa
        confidence = "high" if n_purchases >= 5 else "medium" if n_purchases >= 3 else "low"
        # Recuperabilidade (mesma função/sinais do profile → score idêntico).
        reg = purchase_regularity(dates_by_customer.get(row["customer_id"], []))
        rs = recovery_score(
            recency, st["eff_cycle"], reg,
            _rev_recent_map.get(row["customer_id"], 0.0),
            _rev_before_map.get(row["customer_id"], 0.0),
            n_purchases, span,
        )
        priority_value = round(st["expected_value"] * (rs["recoveryScore"] / 100), 2)
        opportunities.append({
            "id": str(uuid.uuid4()),
            "customerHash": hashlib.md5(
                normalize_customer_name(str(row["customer_id"])).encode("utf-8")
            ).hexdigest(),
            "customer": display_map.get(row["customer_id"], row["customer_id"]),
            "product": str(row["last_product"]) if row.get("last_product") else "Produto não identificado",
            "type": "declining_customer" if st["status"] == "at_risk" else "missing_sale",
            "lastPurchase": ultima.isoformat() if ultima else None,
            "daysInactive": recency,
            "frequency": _frequency_label(n_purchases, primeira, ultima),
            "expectedValue": st["expected_value"],
            "confidence": confidence,
            "recoveryScore": rs["recoveryScore"],
            "recoveryBand": rs["recoveryBand"],
            "recoveryReasons": rs["recoveryReasons"],
            "priorityValue": priority_value,
            "_sort": st["expected_value"],
        })
    # Ordena por valor recuperável desc (não por valor_total bruto)
    opportunities.sort(key=lambda o: o["_sort"], reverse=True)
    opportunities = opportunities[:15]
    for o in opportunities:
        o.pop("_sort", None)

    # KPI lostRevenue: soma do valor recuperável dos clientes churned (histórico completo),
    # não a receita do período. timeSeries.perdida (abaixo) segue por período.
    lost_revenue = round(lost_revenue, 2)
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
    dates_by_customer = _dates_by_customer(df)  # regularidade (fonte única do recovery_score)
    rev_recent_map, rev_before_map = _pre_lpd_trend_maps(df)  # tendência pré-saída (fonte única)
    max_date = _max_date(df)
    # Mesma base de recência que generate_dynamic_insights (guard de defasagem):
    # hoje se o arquivo é recente (≤7d), senão o file_max. Garante status/recovery
    # IDÊNTICOS entre o perfil e a lista de oportunidades, inclusive em arquivos "live".
    today = datetime.now().date()
    reference_date = today if (today - max_date).days <= 7 else max_date
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
        recency_days = (reference_date - last_date).days if last_date else 0
        frequency = int(row["frequency"] or 1)
        percentage = round((total_rev / total_company_revenue) * 100, 1) if total_company_revenue > 0 else 0.0

        span_days = (last_date - first_date).days if (last_date and first_date) else 0
        avg_interval_days = round(span_days / (frequency - 1), 1) if frequency > 1 and span_days > 0 else 0.0
        churn = assess_churn_risk(recency_days, avg_interval_days, frequency, cycle_days=cycle_days)
        # Régua única: mesmo status/valor recuperável que a lista de oportunidades.
        st = classify_customer_status(
            recency_days, avg_interval_days, frequency, total_rev, span_days, cycle_days=cycle_days
        )

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

        # Recuperabilidade (mesma função/sinais da lista de oportunidades → score idêntico).
        # Tendência pré-saída (rev_recent/rev_before), não os trimestres de calendário.
        reg = purchase_regularity(dates_by_customer.get(cust_name, []))
        rs = recovery_score(
            recency_days, st["eff_cycle"], reg,
            rev_recent_map.get(cust_name, 0.0),
            rev_before_map.get(cust_name, 0.0),
            frequency, span_days,
        )
        priority_value = round(st["expected_value"] * (rs["recoveryScore"] / 100), 2)

        # Top products (pre-computed, no per-customer filter)
        raw_prods = top_prods_by_customer.get(cust_name, [])
        top_products = [
            {**p, "percentage": round((p["totalValue"] / total_rev) * 100, 1) if total_rev > 0 else 0.0}
            for p in raw_prods
        ]

        monthly_revenue = monthly_by_customer.get(cust_name, [])

        # Alertas e expectedValue seguem a régua única (st), não o segmento RFV —
        # garante MESMO expectedValue que a lista de oportunidades para o mesmo cliente.
        confidence = "high" if frequency >= 5 else "medium" if frequency >= 3 else "low"
        alerts = []
        if st["status"] == "at_risk":
            alerts.append({
                "id": str(uuid.uuid4()),
                "type": "declining_customer",
                "description": f"Cliente atrasado há {st['days_overdue']} dias além do ciclo típico. Risco de perda (Churn).",
                "expectedValue": st["expected_value"],
                "confidence": confidence,
            })
        elif st["status"] == "churned":
            alerts.append({
                "id": str(uuid.uuid4()),
                "type": "missing_sale",
                "description": "Cliente sumiu (sem compra há mais de 1,5× o ciclo). Campanha de win-back recomendada.",
                "expectedValue": st["expected_value"],
                "confidence": confidence,
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
            "status": st["status"],                 # "active" | "at_risk" | "churned" (fonte única)
            "expected_value": st["expected_value"],  # valor recuperável por ciclo (régua única)
            "recoveryScore": rs["recoveryScore"],
            "recoveryBand": rs["recoveryBand"],
            "recoveryReasons": rs["recoveryReasons"],
            "priorityValue": priority_value,
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
        result = generate_dynamic_insights(df, dr, cycle_days=cycle_days)
        if result is not None:
            insights_by_range[dr] = result

    customer_profiles = build_customer_profiles(df, cycle_days=cycle_days)

    # Summary stats for AnalysisResult — DERIVADO da fonte única (classify_customer_status),
    # não mais do corte legado de 60d. Garante que o card de histórico de uploads concorde
    # com a Visão Geral e o Insights (todos via ciclo efetivo). FIX 4.1.
    # Definição de oportunidade idêntica à da Visão Geral: status in (at_risk, churned).
    total_revenue = float(df["revenue"].sum() or 0.0)
    opp_profiles = [
        p for p in customer_profiles
        if p.get("status") in ("at_risk", "churned")
    ]
    lost_revenue = round(sum(float(p.get("expected_value") or 0.0) for p in opp_profiles), 2)

    return {
        "total_revenue": total_revenue,
        "lost_revenue": lost_revenue,
        "opportunities_count": len(opp_profiles),
        "unique_customers": int(df["customer_id"].n_unique()),
        "unique_products": int(df["product_id"].n_unique()),
        "insights_by_range": insights_by_range,
        "customer_profiles": customer_profiles,
    }
