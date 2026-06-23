# Migrações (Alembic)

Schema versionado. Substitui o `create_all` + `_ensure_columns` manual conforme
as migrações forem adotadas (os dois convivem com segurança durante a transição).

## Primeiro uso (gerar baseline a partir dos models)
Aponte `DATABASE_URL` para o banco e rode, a partir de `backend/`:

```bash
alembic revision --autogenerate -m "baseline"
alembic upgrade head
```

`env.py` lê `DATABASE_URL` do ambiente e usa `app.domain.models.Base.metadata`
como alvo do autogenerate (`compare_type=True`).

## Fluxo normal
```bash
alembic revision --autogenerate -m "descrição da mudança"
alembic upgrade head      # aplica
alembic downgrade -1      # reverte a última
```

> Em produção, rode `alembic upgrade head` no deploy (antes de subir a API).
> Enquanto não houver baseline, `database._ensure_columns()` mantém o schema
> em dia de forma idempotente.
