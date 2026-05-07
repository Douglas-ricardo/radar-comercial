Você está no projeto **Radar Comercial** (FastAPI + SQLAlchemy).

Adicione um novo modelo ao banco de dados seguindo os padrões do projeto.

## Arquivo alvo
`backend/app/domain/models.py`

## Padrão obrigatório

```python
class NomeDoModelo(Base):
    __tablename__ = "nome_da_tabela"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String, ForeignKey("companies.id"), nullable=False, index=True)
    # ... outros campos
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

## Regras

**PKs:** sempre `String` com UUID gerado por lambda — nunca `Integer` autoincrement.

**Multi-tenancy:** todo modelo que contém dados de empresa **deve** ter `company_id` com `ForeignKey("companies.id")` e `index=True`.

**Datas:** usar `datetime.utcnow` (já importado no arquivo). Nunca `datetime.now()`.

**Campos JSON:** usar `Column(JSON, default=dict)` ou `Column(JSON, default=list)` — não `Column(JSON, default={})` (Python compartilha o mesmo objeto entre instâncias).

**UniqueConstraint:** quando precisar de unicidade composta, usar:
```python
__table_args__ = (
    UniqueConstraint("campo1", "campo2", name="uq_tabela_campo1_campo2"),
)
```
`UniqueConstraint` já está importado no arquivo.

**Sem Alembic:** o projeto usa `Base.metadata.create_all()` na inicialização. Novas tabelas são criadas automaticamente. **Mudanças em tabelas existentes** (adicionar coluna, mudar tipo) precisam ser feitas manualmente no banco em produção — documentar no PR.

**Dados sensíveis:** nunca criar modelos que armazenem transações individuais de clientes (data + produto + valor + qty). Ver `ComputedInsights` e `CustomerProfile` como referência de como guardar apenas agregações.

## Após criar o modelo

1. Importar em qualquer arquivo que precise usá-lo
2. O `Base.metadata.create_all()` em `database.py` criará a tabela automaticamente no próximo start
3. Se for usado em `tasks.py`, adicionar o import lá também

---

Tarefa: $ARGUMENTS
