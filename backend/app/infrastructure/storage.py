# app/infrastructure/storage.py
"""
Abstração de armazenamento de arquivos temporários de ingestão.

Quando as credenciais de object storage S3-compatível (Cloudflare R2 ou
DigitalOcean Spaces) estão configuradas, os uploads vão para o bucket e o
worker baixa de lá — removendo o acoplamento API↔worker ao mesmo disco e
habilitando múltiplas instâncias. Sem credenciais, cai graciosamente para
disco local (comportamento legado).

Refs de arquivo:
  - "r2://<key>"  → objeto no bucket
  - "<path>"      → caminho local (fallback)
"""
import logging
import os
import uuid
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_ENDPOINT = os.getenv("R2_ENDPOINT_URL") or os.getenv("S3_ENDPOINT_URL")
_ACCESS_KEY = os.getenv("R2_ACCESS_KEY_ID") or os.getenv("S3_ACCESS_KEY_ID")
_SECRET_KEY = os.getenv("R2_SECRET_ACCESS_KEY") or os.getenv("S3_SECRET_ACCESS_KEY")
_BUCKET = os.getenv("R2_BUCKET") or os.getenv("S3_BUCKET")
_REGION = os.getenv("R2_REGION", "auto")

_REMOTE_PREFIX = "r2://"

REMOTE_ENABLED = bool(_ENDPOINT and _ACCESS_KEY and _SECRET_KEY and _BUCKET)

_TEMP_DIR = Path(os.getenv("TEMP_DIR", str(Path(__file__).resolve().parent.parent.parent / "temp")))

_client = None


def _get_client():
    global _client
    if _client is None:
        import boto3  # import tardio: só carrega se storage remoto estiver ativo
        _client = boto3.client(
            "s3",
            endpoint_url=_ENDPOINT,
            aws_access_key_id=_ACCESS_KEY,
            aws_secret_access_key=_SECRET_KEY,
            region_name=_REGION,
        )
    return _client


def is_remote_ref(ref: str) -> bool:
    return ref.startswith(_REMOTE_PREFIX)


def source_exists(ref: str) -> bool:
    """A fonte ainda existe? (path local presente ou objeto remoto acessível).
    Best-effort: usado pelo reprocessamento para evitar enfileirar uma fonte
    que já foi apagada."""
    if not ref:
        return False
    if is_remote_ref(ref):
        key = ref[len(_REMOTE_PREFIX):]
        try:
            _get_client().head_object(Bucket=_BUCKET, Key=key)
            return True
        except Exception:
            return False
    return os.path.exists(ref)


def store_from_local(local_path: str, key: str) -> str:
    """
    Promove um arquivo local para o storage definitivo.
    Remoto: faz upload, remove o local e retorna "r2://<key>".
    Local: retorna o próprio caminho (sem cópia).
    """
    if not REMOTE_ENABLED:
        return local_path
    try:
        _get_client().upload_file(local_path, _BUCKET, key)
    except Exception:
        logger.error("storage.upload.error", extra={"key": key}, exc_info=True)
        raise
    try:
        os.remove(local_path)
    except OSError:
        pass
    logger.info("storage.upload.ok", extra={"key": key})
    return f"{_REMOTE_PREFIX}{key}"


def fetch_to_local(ref: str) -> str:
    """
    Garante uma cópia local para processamento (Polars lê de path local).
    Remoto: baixa para temp e retorna o path baixado.
    Local: retorna o próprio ref.
    """
    if not is_remote_ref(ref):
        return ref
    key = ref[len(_REMOTE_PREFIX):]
    _TEMP_DIR.mkdir(parents=True, exist_ok=True)
    local_path = str(_TEMP_DIR / f"dl_{uuid.uuid4().hex[:8]}_{Path(key).name}")
    _get_client().download_file(_BUCKET, key, local_path)
    logger.info("storage.download.ok", extra={"key": key})
    return local_path


def delete(ref: str) -> None:
    """Remove o objeto remoto (se aplicável). Não falha o chamador."""
    if not is_remote_ref(ref):
        return
    key = ref[len(_REMOTE_PREFIX):]
    try:
        _get_client().delete_object(Bucket=_BUCKET, Key=key)
        logger.info("storage.delete.ok", extra={"key": key})
    except Exception as exc:
        logger.warning("storage.delete.error", extra={"key": key, "error": str(exc)})


def cleanup_local(path: Optional[str]) -> None:
    """Remove um arquivo local temporário se existir."""
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except OSError as exc:
            logger.warning("storage.cleanup_local.error", extra={"path": path, "error": str(exc)})
