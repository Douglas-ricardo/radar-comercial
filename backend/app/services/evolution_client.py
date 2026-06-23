# app/services/evolution_client.py
"""Cliente para a Evolution API (WhatsApp não-oficial, self-hosted).

Cada empresa (tenant) tem uma "instância" própria conectada ao número do
vendedor via QR Code. Degrada graciosamente quando não configurado.

Env:
  EVOLUTION_API_URL   — ex: http://localhost:8080
  EVOLUTION_API_KEY   — apikey global definida no container Evolution
"""
from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

_INTEGRATION = "WHATSAPP-BAILEYS"


def _base_url() -> Optional[str]:
    url = os.getenv("EVOLUTION_API_URL")
    return url.rstrip("/") if url else None


def _api_key() -> Optional[str]:
    return os.getenv("EVOLUTION_API_KEY")


def is_configured() -> bool:
    return bool(_base_url() and _api_key())


def _headers() -> dict:
    return {"apikey": _api_key() or "", "Content-Type": "application/json"}


class EvolutionError(Exception):
    pass


def _request(method: str, path: str, **kwargs) -> dict:
    if not is_configured():
        raise EvolutionError("Evolution API não configurada (EVOLUTION_API_URL / EVOLUTION_API_KEY).")
    import httpx
    url = f"{_base_url()}{path}"
    try:
        resp = httpx.request(method, url, headers=_headers(), timeout=20, **kwargs)
    except Exception as exc:
        raise EvolutionError(f"Falha de conexão com Evolution API: {exc}") from exc
    if resp.status_code >= 400:
        raise EvolutionError(f"Evolution API {resp.status_code}: {resp.text[:300]}")
    try:
        return resp.json()
    except Exception:
        return {}


def create_instance(instance: str) -> dict:
    """Cria a instância (idempotente — se já existe, Evolution retorna erro que ignoramos)."""
    payload = {"instanceName": instance, "integration": _INTEGRATION, "qrcode": True}
    try:
        return _request("POST", "/instance/create", json=payload)
    except EvolutionError as exc:
        # instância já existente não é erro fatal
        if "already" in str(exc).lower() or "exists" in str(exc).lower():
            logger.info("evolution.instance.exists", extra={"instance": instance})
            return {"status": "exists"}
        raise


def connect(instance: str) -> dict:
    """Retorna o QR Code (base64) para o vendedor escanear."""
    return _request("GET", f"/instance/connect/{instance}")


def connection_state(instance: str) -> str:
    """Retorna 'open' (conectado), 'connecting' ou 'close' (desconectado)."""
    data = _request("GET", f"/instance/connectionState/{instance}")
    state = (data.get("instance") or {}).get("state") or data.get("state")
    return state or "close"


def logout(instance: str) -> dict:
    return _request("DELETE", f"/instance/logout/{instance}")


def delete_instance(instance: str) -> dict:
    return _request("DELETE", f"/instance/delete/{instance}")


def send_text(instance: str, number: str, text: str) -> dict:
    """Envia mensagem de texto. number em E.164 sem '+' (ex: 5511982387185)."""
    digits = "".join(ch for ch in str(number) if ch.isdigit())
    payload = {"number": digits, "text": text}
    return _request("POST", f"/message/sendText/{instance}", json=payload)


def set_webhook(instance: str, url: str) -> dict:
    """Registra a URL de webhook da instância para receber mensagens recebidas.
    Best-effort: falha aqui não deve impedir a conexão do WhatsApp."""
    payload = {
        "webhook": {
            "enabled": True,
            "url": url,
            "events": ["MESSAGES_UPSERT"],
        }
    }
    return _request("POST", f"/webhook/set/{instance}", json=payload)
