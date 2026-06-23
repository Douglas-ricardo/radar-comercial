"""Conector Pipedrive — usa api_token na query string. API v1."""
import logging

import httpx

from app.services.crm.base import CrmConnector, CrmError

logger = logging.getLogger(__name__)

_BASE = "https://api.pipedrive.com/v1"


class PipedriveConnector(CrmConnector):
    provider = "pipedrive"

    def _token(self) -> str:
        token = self.credentials.get("api_token") or self.credentials.get("token")
        if not token:
            raise CrmError("Pipedrive: api_token ausente.")
        return token

    def test_connection(self) -> bool:
        try:
            r = httpx.get(f"{_BASE}/users/me", params={"api_token": self._token()}, timeout=15)
            r.raise_for_status()
            return bool(r.json().get("success", True))
        except httpx.HTTPError as exc:
            raise CrmError(f"Pipedrive: falha de conexão ({exc}).")

    def fetch_contacts(self, limit: int = 200) -> list[dict]:
        out: list[dict] = []
        try:
            r = httpx.get(f"{_BASE}/persons", params={"api_token": self._token(), "limit": min(limit, 500)}, timeout=30)
            r.raise_for_status()
            for p in (r.json().get("data") or []):
                email = None
                if p.get("email"):
                    email = p["email"][0].get("value") if isinstance(p["email"], list) else p["email"]
                phone = None
                if p.get("phone"):
                    phone = p["phone"][0].get("value") if isinstance(p["phone"], list) else p["phone"]
                out.append({"name": p.get("name"), "email": email, "phone": phone, "document": None})
        except httpx.HTTPError as exc:
            raise CrmError(f"Pipedrive: erro ao puxar contatos ({exc}).")
        return out

    def push_deal(self, payload: dict) -> None:
        body = {
            "title": f"{payload.get('customer_name')} — {payload.get('new_status')}",
            "value": payload.get("expected_value") or 0,
            "status": "won" if payload.get("new_status") == "won" else "lost",
        }
        try:
            r = httpx.post(f"{_BASE}/deals", params={"api_token": self._token()}, json=body, timeout=15)
            r.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("crm.pipedrive.push_error", extra={"error": str(exc)})
