# app/core/clock.py
"""Relógio central do backend.

`datetime.utcnow()` está deprecado no Python 3.12+. Porém as colunas de data do
banco são naive (`timestamp without time zone`), então NÃO podemos passar a usar
datetimes timezone-aware diretamente (quebraria comparações aware×naive).

`utcnow()` resolve os dois lados: usa a API nova (`datetime.now(timezone.utc)`)
mas devolve um datetime naive em UTC — idêntico em valor ao antigo `utcnow()`,
mantendo compatibilidade com o schema atual.
"""
from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
