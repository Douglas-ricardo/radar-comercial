"""Reprocessamento (opt-in): guardas de erro sem depender de worker/storage."""
import uuid

from app.domain.models import UploadedFile


def test_reprocess_inexistente_404(client, company_a):
    r = client.post("/api/files/nao-existe/reprocess", cookies=company_a["cookie"])
    assert r.status_code == 404


def test_reprocess_sem_fonte_retida_409(client, db, company_a):
    fid = str(uuid.uuid4())
    db.add(UploadedFile(
        id=fid, company_id=company_a["company"].id, filename="x.csv",
        status="completed", source_ref=None,
    ))
    db.commit()
    r = client.post(f"/api/files/{fid}/reprocess", cookies=company_a["cookie"])
    assert r.status_code == 409  # fonte não retida (padrão LGPD)


def test_reprocess_cross_tenant_404(client, db, company_a, company_b):
    fid = str(uuid.uuid4())
    db.add(UploadedFile(
        id=fid, company_id=company_a["company"].id, filename="x.csv",
        status="completed", source_ref="/tmp/inexistente.csv",
    ))
    db.commit()
    # admin da empresa B não enxerga arquivo da empresa A → 404 (não vaza)
    r = client.post(f"/api/files/{fid}/reprocess", cookies=company_b["cookie"])
    assert r.status_code == 404
