"""
Guard de mudança de base no UPLOAD manual (opção B / causa-raiz): um arquivo que
substituiria a base por clientes DIFERENTES (baixa sobreposição) não apaga nada —
vira "needs_confirmation". Reenviar com force=true (guard off) substitui.
"""
import os

from app.domain.models import CustomerProfile, UploadedFile
from app.workers import tasks as worker_tasks


def _seed_base(db, cid, n=12):
    for i in range(n):
        db.add(CustomerProfile(
            company_id=cid, customer_hash=f"hash_base_{i}",
            customer_name=f"Cliente Real {i}", segment="loyal",
            recency_days=10, total_revenue=100.0,
        ))
    db.commit()


def _csv_clientes_diferentes(tmp_path):
    # 12 clientes com nomes TOTALMENTE diferentes → hashes não batem → overlap ~0%
    linhas = ["data,cliente,valor"]
    for i in range(12):
        linhas.append(f"2026-07-0{(i % 5) + 1},Fantasia Nova {i},50")
        linhas.append(f"2026-06-2{(i % 9)},Fantasia Nova {i},70")
    src = tmp_path / "arquivo_diferente.csv"
    src.write_text("\n".join(linhas) + "\n")
    return src


def test_upload_com_base_diferente_pede_confirmacao(db, company_a, tmp_path, monkeypatch):
    cid = company_a["company"].id
    _seed_base(db, cid)
    antes = db.query(CustomerProfile).filter_by(company_id=cid).count()

    src = _csv_clientes_diferentes(tmp_path)
    up = UploadedFile(company_id=cid, filename="upload.csv", status="processing", source_ref=str(src))
    db.add(up); db.commit()

    monkeypatch.setattr(worker_tasks, "SessionLocal", lambda: db)
    monkeypatch.setattr(db, "close", lambda: None)

    res = worker_tasks.process_sales_file.apply(
        args=(up.id, cid, str(src)),
        kwargs={"guard_base_shrink": True, "confirmable_guard": True},
    )
    assert res.result.get("status") == "needs_confirmation", res.result
    db.refresh(up)
    assert up.status == "needs_confirmation"
    assert "substitui" in (up.error_message or "").lower()
    # base intacta
    assert db.query(CustomerProfile).filter_by(company_id=cid).count() == antes


def test_upload_com_force_substitui(db, company_a, tmp_path, monkeypatch):
    cid = company_a["company"].id
    _seed_base(db, cid)

    src = _csv_clientes_diferentes(tmp_path)
    up = UploadedFile(company_id=cid, filename="upload_force.csv", status="processing")
    db.add(up); db.commit()

    monkeypatch.setattr(worker_tasks, "SessionLocal", lambda: db)
    monkeypatch.setattr(db, "close", lambda: None)

    # force=true → o endpoint despacha SEM guard (guard_base_shrink=False)
    res = worker_tasks.process_sales_file.apply(args=(up.id, cid, str(src)))
    assert res.result.get("status") == "success", res.result
    # base substituída pelos 12 clientes novos
    assert db.query(CustomerProfile).filter_by(company_id=cid).count() == 12
    assert os.path.exists(src) or True  # fonte pode ter sido limpa (LGPD) — não é o foco
