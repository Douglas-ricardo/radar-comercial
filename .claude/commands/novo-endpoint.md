Você está no projeto **Radar Comercial** (FastAPI + SQLAlchemy + Celery).

Crie um novo endpoint na API seguindo **todos** os padrões do projeto.

## Padrões obrigatórios

**Arquivo:** `backend/app/api/{recurso}.py`

**Estrutura base de uma rota protegida:**
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.infrastructure.database import get_db_session
from app.core.auth import get_current_user_and_company
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/{recurso}", tags=["{Recurso}"])

@router.get("/{company_id}")
def nome_da_rota(
    company_id: str,
    token_data=Depends(get_current_user_and_company),
    db: Session = Depends(get_db_session),
):
    # SEMPRE validar que company_id do token bate com o da URL
    if str(token_data.company_id) != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    # ... lógica
    return {"success": True, "data": ...}
```

**Regras:**
- Toda rota usa `Depends(get_current_user_and_company)` — nunca crie rota desprotegida sem motivo explícito
- Toda query filtra por `company_id` extraído do token, não da URL
- Resposta sempre `{"success": True, "data": ...}` ou `{"success": False, "error": "..."}`
- Logs com `logger.info("recurso.acao", extra={"company_id": ..., ...})` — sem `print()`
- Após criar o arquivo, registrar o router em `backend/app/main.py` com `app.include_router(...)`

**Planos e limites:** Se a rota lida com features pagas, verificar via `PlanService` em `backend/app/services/plan_service.py`.

**Dados sensíveis:** Nunca salvar transações individuais de clientes no banco. Apenas métricas agregadas (`ComputedInsights`, `CustomerProfile`).

---

Tarefa: $ARGUMENTS
