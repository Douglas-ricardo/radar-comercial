"""
Regressão do bug crítico do ingest (simulação de 1 semana, 2026-07-04):

O pipeline de análise faz REPLACE TOTAL dos CustomerProfile a partir do arquivo
processado. O /data/ingest despachava cada lote isolado direto no pipeline, então
o fluxo documentado (n8n mandando só as vendas DO DIA a partir do ERP):
  - com >= 5 vendas: APAGAVA a base inteira (10 clientes viravam 3);
  - com < 5 vendas: era rejeitado pelo validador de mínimo de linhas.

Fix: cada lote é ACUMULADO em um buffer por empresa (storage) e o pipeline
processa o buffer inteiro. O worker recebe preserve_source=True e nunca apaga
o buffer (os próximos lotes dependem dele).
"""
import hashlib
import uuid

import pytest

from app.api.integrations import (
    SaleRecord,
    _ingest_buffer_local,
    _ingest_buffer_ref,
    merge_into_ingest_buffer,
)
from app.domain.models import ApiKey


def _mk_key(db, company_id: str) -> str:
    plaintext = f"rc_live_{uuid.uuid4().hex}"
    db.add(ApiKey(
        company_id=company_id, name="teste",
        key_hash=hashlib.sha256(plaintext.encode()).hexdigest(),
        prefix=plaintext[:16], is_active=True,
    ))
    db.commit()
    return plaintext


def _rows(path: str) -> list[str]:
    with open(path, encoding="utf-8") as f:
        return f.read().splitlines()


@pytest.fixture(autouse=True)
def _clean_buffer(company_a):
    import os
    path = _ingest_buffer_local(company_a["company"].id)
    if os.path.exists(path):
        os.remove(path)
    yield
    if os.path.exists(path):
        os.remove(path)


def test_lotes_consecutivos_acumulam_no_buffer(company_a):
    cid = company_a["company"].id
    lote1 = [SaleRecord(data="2026-07-01", cliente=f"Cliente {i}", valor=100.0) for i in range(3)]
    lote2 = [SaleRecord(data="2026-07-02", cliente=f"Outro {i}", valor=50.0,
                        telefone="(11) 98888-0001", email="x@y.com") for i in range(2)]

    ref1 = merge_into_ingest_buffer(cid, lote1)
    linhas1 = _rows(ref1)
    assert len(linhas1) == 1 + 3  # header + lote 1

    ref2 = merge_into_ingest_buffer(cid, lote2)
    linhas2 = _rows(ref2)
    assert ref2 == ref1, "buffer deve ter ref ESTÁVEL entre lotes"
    assert len(linhas2) == 1 + 3 + 2, "lote 2 deve SOMAR ao lote 1, não substituir"
    assert linhas2[0] == "data,cliente,produto,quantidade,valor,telefone,email"
    assert "Cliente 0" in linhas2[1] and "Outro 0" in linhas2[4]
    assert "(11) 98888-0001" in linhas2[4] and "x@y.com" in linhas2[4]


def test_buffer_isolado_por_empresa(company_a, company_b):
    ref_a = merge_into_ingest_buffer(
        company_a["company"].id, [SaleRecord(data="2026-07-01", cliente="A", valor=1.0)])
    ref_b = merge_into_ingest_buffer(
        company_b["company"].id, [SaleRecord(data="2026-07-01", cliente="B", valor=1.0)])
    assert ref_a != ref_b
    assert "A" in "\n".join(_rows(ref_a)) and "B" not in "\n".join(_rows(ref_a))


def test_endpoint_ingest_despacha_buffer_com_preserve_source(client, db, company_a, monkeypatch):
    cid = company_a["company"].id
    key = _mk_key(db, cid)

    dispatches = []
    monkeypatch.setattr(
        "app.api.integrations.process_sales_file.delay",
        lambda *a, **k: dispatches.append((a, k)),
    )

    body1 = {"records": [
        {"data": "2026-07-01", "cliente": "Mercado Um", "valor": 100.0},
        {"data": "2026-07-01", "cliente": "Mercado Dois", "valor": 200.0},
    ]}
    r = client.post("/api/data/ingest", headers={"X-API-Key": key}, json=body1)
    assert r.status_code == 200, r.text

    body2 = {"records": [
        {"data": "2026-07-02", "cliente": "Mercado Três", "valor": 300.0,
         "telefone": "(11) 97777-0001", "email": "tres@mercado.com"},
    ]}
    r = client.post("/api/data/ingest", headers={"X-API-Key": key}, json=body2)
    assert r.status_code == 200, r.text

    assert len(dispatches) == 2
    (a1, k1), (a2, k2) = dispatches
    # mesmo ref (buffer estável) e preserve_source=True nos dois lotes
    assert a1[2] == a2[2]
    assert k1.get("preserve_source") is True and k2.get("preserve_source") is True
    # o buffer despachado no 2º lote contém os DOIS lotes (5 linhas: header + 3)
    linhas = _rows(a2[2])
    conteudo = "\n".join(linhas)
    assert len(linhas) == 1 + 3
    assert "Mercado Um" in conteudo and "Mercado Três" in conteudo
    assert "tres@mercado.com" in conteudo, "telefone/email do SaleRecord devem ir ao CSV"


def test_buffer_apara_linhas_mais_antigas_no_limite(company_a, monkeypatch):
    import app.api.integrations as integ
    monkeypatch.setattr(integ, "_INGEST_BUFFER_MAX_ROWS", 4)
    cid = company_a["company"].id

    merge_into_ingest_buffer(cid, [SaleRecord(data="2026-07-01", cliente=f"Velho {i}", valor=1.0) for i in range(3)])
    ref = merge_into_ingest_buffer(cid, [SaleRecord(data="2026-07-02", cliente=f"Novo {i}", valor=1.0) for i in range(3)])

    linhas = _rows(ref)
    conteudo = "\n".join(linhas)
    assert len(linhas) == 1 + 4  # header + máximo
    assert "Novo 2" in conteudo, "linhas novas nunca são descartadas"
    assert "Velho 0" not in conteudo and "Velho 1" not in conteudo, "descarta as MAIS ANTIGAS"


def test_guarda_de_encolhimento_protege_base_existente(db, company_a, tmp_path, monkeypatch):
    """Empresa com base de 12 clientes (upload manual) recebe carga via API que
    resultaria em só 2: o worker deve ABORTAR com instrução de backfill, sem
    tocar nos perfis existentes."""
    import os
    from app.domain.models import CustomerProfile, UploadedFile
    from app.workers import tasks as worker_tasks

    cid = company_a["company"].id
    for i in range(12):
        db.add(CustomerProfile(
            company_id=cid, customer_hash=f"hash_guard_{i}",
            customer_name=f"Cliente {i}", segment="loyal",
            recency_days=10, total_revenue=100.0,
        ))
    db.commit()
    base_antes = db.query(CustomerProfile).filter_by(company_id=cid).count()

    src = tmp_path / "buffer_pequeno.csv"
    src.write_text("data,cliente,valor\n" + "\n".join(
        f"2026-07-0{(i % 5) + 1},Cliente Ing {i % 2},10" for i in range(8)) + "\n")
    up = UploadedFile(company_id=cid, filename="api_ingest_g.csv",
                      status="processing", source_ref=str(src))
    db.add(up)
    db.commit()

    monkeypatch.setattr(worker_tasks, "SessionLocal", lambda: db)
    monkeypatch.setattr(db, "close", lambda: None)

    res = worker_tasks.process_sales_file.apply(
        args=(up.id, cid, str(src)),
        kwargs={"preserve_source": True, "guard_base_shrink": True})
    out = res.result
    assert isinstance(out, dict) and out.get("status") == "failed", out
    assert "backfill" in (out.get("error") or ""), out
    assert db.query(CustomerProfile).filter_by(company_id=cid).count() == base_antes, \
        "a guarda não pode ter alterado a base"
    assert os.path.exists(src), "buffer preservado mesmo na falha da guarda"

    # sem a guarda (upload manual), substituir a base É intencional → processa
    up2 = UploadedFile(company_id=cid, filename="manual.csv", status="processing")
    db.add(up2)
    db.commit()
    src2 = tmp_path / "manual.csv"
    src2.write_text(src.read_text())
    res = worker_tasks.process_sales_file.apply(args=(up2.id, cid, str(src2)))
    assert res.result.get("status") == "success", res.result
    assert db.query(CustomerProfile).filter_by(company_id=cid).count() == 2


def test_worker_nao_apaga_fonte_com_preserve_source(db, company_a, tmp_path, monkeypatch):
    """process_sales_file(preserve_source=True) mantém o arquivo mesmo após sucesso
    (RETAIN_SOURCE_FILES desligado)."""
    import os
    from app.domain.models import UploadedFile
    from app.workers import tasks as worker_tasks

    src = tmp_path / "buffer.csv"
    src.write_text("data,cliente,valor\n2026-07-01,X,1\n")

    cid = company_a["company"].id
    up = UploadedFile(company_id=cid, filename="api_ingest_test.csv",
                      status="processing", source_ref=str(src))
    db.add(up)
    db.commit()

    monkeypatch.setattr(worker_tasks, "process_sales_pipeline", lambda *a, **k: {
        "total_revenue": 1.0, "lost_revenue": 0.0, "opportunities_count": 0,
        "unique_customers": 1, "unique_products": 1,
        "insights_by_range": {}, "customer_profiles": [],
    })
    monkeypatch.setattr(worker_tasks, "SessionLocal", lambda: db)
    monkeypatch.setattr(db, "close", lambda: None)  # task fecha a sessão; é a compartilhada

    res = worker_tasks.process_sales_file.apply(
        args=(up.id, cid, str(src)), kwargs={"preserve_source": True})
    assert res.successful(), res.result
    assert os.path.exists(src), "preserve_source=True não pode apagar a fonte"

    # contraprova: sem preserve_source o arquivo é apagado (comportamento padrão)
    src2 = tmp_path / "avulso.csv"
    src2.write_text("data,cliente,valor\n2026-07-01,X,1\n")
    up2 = UploadedFile(company_id=cid, filename="avulso.csv", status="processing")
    db.add(up2)
    db.commit()
    res = worker_tasks.process_sales_file.apply(args=(up2.id, cid, str(src2)))
    assert res.successful(), res.result
    assert not os.path.exists(src2), "sem preserve_source o padrão LGPD apaga a fonte"
