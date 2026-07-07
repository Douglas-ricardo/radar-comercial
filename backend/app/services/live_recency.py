# app/services/live_recency.py
"""
Recência viva: recalcula "dias sem comprar" contra HOJE no momento da leitura,
em vez de usar o valor congelado no último ETL.

Regra de frescor (mesma do guard do ETL em data_engine/etl.py:788): só conta ao
vivo enquanto o feed de vendas está fresco — se a data mais recente da base
(dataset_max) já passou da janela, devolve o valor gravado (congela). Assim o
Radar não infla os dias em cima de dado velho.

ESCOPO: apenas o número de dias. expectedValue, status, recoveryScore, seleção
e prioridade das oportunidades continuam vindo congelados do ETL — este módulo
nunca os toca.
"""
import os
from datetime import date

from app.core.clock import utcnow


def _default_window() -> int:
    try:
        w = int(os.getenv("RECENCY_FRESHNESS_WINDOW_DAYS", "7"))
    except ValueError:
        w = 7
    return w if w > 0 else 7


def _parse_date(value) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None


def _today() -> date:
    return utcnow().date()


def _is_fresh(dataset_max: date | None, today: date, window: int) -> bool:
    """A base está fresca se a compra mais recente é de <= `window` dias atrás."""
    return dataset_max is not None and 0 <= (today - dataset_max).days <= window


def live_recency_days(
    last_purchase_iso,
    stored_days,
    dataset_max_iso,
    *,
    today: date | None = None,
    window: int | None = None,
) -> int:
    """
    Dias vivos para UM cliente (caminho do outreach, por CustomerProfile).
    Dado fresco → (hoje − última_compra); dado velho ou entradas inválidas →
    devolve o valor gravado (`stored_days`).
    """
    today = today or _today()
    window = window if window is not None else _default_window()
    stored = int(stored_days or 0)

    last_purchase = _parse_date(last_purchase_iso)
    dataset_max = _parse_date(dataset_max_iso)
    if last_purchase is None:
        return stored
    if not _is_fresh(dataset_max, today, window):
        return stored
    return max(0, (today - last_purchase).days)


def company_dataset_max(db, company_id) -> str | None:
    """Data ISO da compra mais recente da empresa (referência de frescor).

    CRÍTICO usar a base INTEIRA — os clientes ativos (que compraram recente) são
    justamente o que mantém o feed fresco, e eles NÃO entram na lista de
    oportunidades. Derivar o dataset_max só das oportunidades enxergaria a base
    como sempre velha e nunca ticaria. Máx. lexicográfico serve p/ ISO."""
    from sqlalchemy import func
    from app.domain.models import CustomerProfile
    return (
        db.query(func.max(CustomerProfile.last_purchase_date))
        .filter(CustomerProfile.company_id == company_id)
        .scalar()
    )


def refresh_days_inactive(
    opportunities,
    dataset_max_iso,
    *,
    today: date | None = None,
    window: int | None = None,
) -> list:
    """
    Reescreve `daysInactive` de cada oportunidade a partir de `lastPurchase`,
    SÓ se a base está fresca (`dataset_max_iso` = compra mais recente da EMPRESA
    inteira, via company_dataset_max — não derivar da lista de oportunidades).
    Retorna uma NOVA lista de NOVOS dicts (não muta o original — o dict pode ser
    o `row.opportunities` do SQLAlchemy ou o JSON do cache). Fora do frescor,
    devolve as oportunidades inalteradas.
    """
    if not opportunities or not isinstance(opportunities, list):
        return opportunities

    today = today or _today()
    window = window if window is not None else _default_window()

    dataset_max = _parse_date(dataset_max_iso)
    if not _is_fresh(dataset_max, today, window):
        return opportunities

    refreshed = []
    for o in opportunities:
        lp = _parse_date(o.get("lastPurchase")) if isinstance(o, dict) else None
        if lp is None:
            refreshed.append(o)
            continue
        refreshed.append({**o, "daysInactive": max(0, (today - lp).days)})
    return refreshed
