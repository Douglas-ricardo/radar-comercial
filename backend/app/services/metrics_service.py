"""
Fonte ÚNICA das métricas de RESULTADO (recuperado, conversão, captura, em risco).

Problema que isto resolve: cada métrica era recalculada em vários lugares com
fórmulas diferentes (dashboard vs carteira vs ranking vs gerencial) e as telas se
contradiziam (ex.: "Conversão 100%" no dashboard vs "45%" na carteira). Aqui há UMA
definição por métrica; todas as telas/endpoints consomem destas funções.

Decisões de negócio implementadas:
  A. "Recuperado" = manual (deals marcados `won` na carteira) + automático
     (OutreachAttribution recuperada), deduplicado por customer_hash (a recuperação
     mais antiga vence) e com a origem rastreada no breakdown {manual, outreach}.
  B. "Conversão" = won / (trabalhados), onde trabalhados = contacted + won + lost
     (exclui `to_contact`). Trabalhados = 0 → None ("sem contatos ainda").
  C. "% do potencial recuperado" (antigo "ROI") = recuperado / potencial total.
     "Em risco" = lostRevenue do ETL (fonte única já existente).

Reusa as fontes únicas dos FIX 4/5 (status do cliente e recovery_score já vêm
embutidos nas oportunidades do ComputedInsights) — não recalcula nada disso aqui.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.domain.models import CustomerProfile, OpportunityAction, OutreachAttribution

# Estágios que contam como "oportunidade trabalhada" (Decisão B).
WORKED_STATUSES = ("contacted", "won", "lost")


def conversion_rate(won: int, contacted: int, lost: int) -> Optional[float]:
    """Decisão B: won / (contacted + won + lost). None se nada foi trabalhado.

    Função pura — usada pelo dashboard, ranking por vendedor e gerencial por filial,
    garantindo que o MESMO estado produza o MESMO número em todas as telas.
    """
    worked = won + contacted + lost
    if worked <= 0:
        return None
    return round(won / worked * 100, 1)


def _when(dt: Optional[datetime]) -> datetime:
    """Timestamp comparável; None vira 'infinito' (menos preferido no dedup)."""
    return dt if dt is not None else datetime.max


def recovered_breakdown(won_actions: list, recovered_attrs: list) -> dict:
    """Decisão A: combina recuperação manual + automática, dedup por customer_hash.

    Args:
        won_actions: OpportunityAction com status == 'won' (origem manual).
                     opportunity_id é o customer_hash; valor = expected_value.
        recovered_attrs: OutreachAttribution com status == 'recovered' (origem
                     automática); valor = recovered_value.

    Regra de dedup: se o mesmo customer_hash foi recuperado pelas duas vias, conta
    UMA vez — vence a recuperação mais antiga (timestamp). A origem fica registrada
    por hash, alimentando o breakdown {manual, outreach}.

    Returns: {"total", "manual", "outreach", "items": {hash: {value, source}}}
    """
    by_hash: dict[str, dict] = {}

    def _consider(hash_: str, value: float, source: str, when: datetime) -> None:
        existing = by_hash.get(hash_)
        if existing is None or when < existing["when"]:
            by_hash[hash_] = {"value": round(value or 0.0, 2), "source": source, "when": when}

    for attr in recovered_attrs:
        _consider(
            attr.customer_hash,
            attr.recovered_value or 0.0,
            "outreach",
            _when(attr.resolved_at or attr.contacted_at),
        )
    for action in won_actions:
        _consider(
            action.opportunity_id,
            action.expected_value or 0.0,
            "manual",
            _when(action.updated_at),
        )

    manual = round(sum(v["value"] for v in by_hash.values() if v["source"] == "manual"), 2)
    outreach = round(sum(v["value"] for v in by_hash.values() if v["source"] == "outreach"), 2)
    return {
        "total": round(manual + outreach, 2),
        "manual": manual,
        "outreach": outreach,
        "items": {h: {"value": v["value"], "source": v["source"]} for h, v in by_hash.items()},
    }


def latest_action_by_opportunity(actions) -> dict:
    """Última ação por opportunity_id (dedup entre usuários) — mais recente por `updated_at` vence.

    Tiebreak ÚNICO compartilhado por `company_result_metrics` e pelo gerencial. Garante que o
    MESMO estado produza o MESMO "status vencedor" (e portanto won/conversão) nas duas telas,
    de forma determinística (não dependente da ordem de retorno do banco).
    """
    latest: dict[str, OpportunityAction] = {}
    for a in actions:
        prev = latest.get(a.opportunity_id)
        if prev is None or _when(a.updated_at) >= _when(prev.updated_at):
            latest[a.opportunity_id] = a
    return latest


def company_result_metrics(
    db: Session,
    company_id: str,
    scope_hashes: Optional[set[str]] = None,
) -> dict:
    """Métricas de resultado da empresa, a partir dos dados canônicos.

    Agrega por OPORTUNIDADE (último status vence quando há ações de usuários
    diferentes sobre o mesmo customer_hash) — alinhado ao gerencial. `scope_hashes`
    aplica a mesma restrição territorial da carteira (None = sem restrição).
    """
    actions = (
        db.query(OpportunityAction)
        .filter(OpportunityAction.company_id == company_id)
        .all()
    )

    # Último status por oportunidade (dedup entre usuários); tiebreak compartilhado.
    latest = latest_action_by_opportunity(
        a for a in actions if scope_hashes is None or a.opportunity_id in scope_hashes
    )

    counts = {"to_contact": 0, "contacted": 0, "won": 0, "lost": 0}
    won_actions = []
    for a in latest.values():
        counts[a.status] = counts.get(a.status, 0) + 1
        if a.status == "won":
            won_actions.append(a)

    recovered_attrs = (
        db.query(OutreachAttribution)
        .filter_by(company_id=company_id, status="recovered")
        .all()
    )
    if scope_hashes is not None:
        recovered_attrs = [r for r in recovered_attrs if r.customer_hash in scope_hashes]

    recovered = recovered_breakdown(won_actions, recovered_attrs)

    # Potencial e "em risco" sobre a fonte única PERSISTIDA (CustomerProfile.expected_value),
    # cobrindo TODOS os clientes at_risk/churned — NÃO o top-15 de exibição da lista de
    # oportunidades (que é só recorte de UI). Mesma base evita capturePct > 100% e o
    # contrassenso "em risco > potencial". `scope_hashes` aplica o mesmo recorte territorial.
    prof_q = (
        db.query(CustomerProfile.status, CustomerProfile.expected_value)
        .filter(CustomerProfile.company_id == company_id)
        .filter(CustomerProfile.status.in_(("at_risk", "churned")))
    )
    if scope_hashes is not None:
        prof_q = prof_q.filter(CustomerProfile.customer_hash.in_(scope_hashes))

    potential_total = 0.0
    at_risk = 0.0  # subconjunto "churned" do potencial → atRisk <= potentialTotal sempre
    for status_, ev in prof_q.all():
        ev = float(ev or 0.0)
        potential_total += ev
        if status_ == "churned":
            at_risk += ev
    potential_total = round(potential_total, 2)
    at_risk = round(at_risk, 2)

    # Captura = recuperado / potencial, limitada a 100%: o recuperado pode exceder o
    # potencial corrente (cliente recuperado pode já ter saído da base de oportunidades,
    # ou won com valor acima do recuperável por ciclo) — não deve estourar a barra.
    capture_pct = (
        min(100.0, round(recovered["total"] / potential_total * 100, 1))
        if potential_total > 0
        else None
    )

    return {
        "recovered": {
            "total": recovered["total"],
            "manual": recovered["manual"],
            "outreach": recovered["outreach"],
        },
        "conversion": conversion_rate(counts["won"], counts["contacted"], counts["lost"]),
        "worked": counts["contacted"] + counts["won"] + counts["lost"],
        "won": counts["won"],
        "contacted": counts["contacted"],
        "lost": counts["lost"],
        "toContact": counts["to_contact"],
        "capturePct": capture_pct,
        "potentialTotal": potential_total,
        "atRisk": at_risk,
    }
