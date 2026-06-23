"""Conector HubSpot — usa token de Private App (Bearer). API v3."""
import logging

import httpx

from app.services.crm.base import CrmConnector, CrmError

logger = logging.getLogger(__name__)

_BASE = "https://api.hubapi.com"


class HubSpotConnector(CrmConnector):
    provider = "hubspot"

    def _headers(self) -> dict:
        token = self.credentials.get("access_token") or self.credentials.get("token")
        if not token:
            raise CrmError("HubSpot: token ausente.")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def test_connection(self) -> bool:
        try:
            r = httpx.get(f"{_BASE}/crm/v3/objects/contacts?limit=1", headers=self._headers(), timeout=15)
            r.raise_for_status()
            return True
        except httpx.HTTPError as exc:
            raise CrmError(f"HubSpot: falha de conexão ({exc}).")

    def fetch_contacts(self, limit: int = 200) -> list[dict]:
        out: list[dict] = []
        params = {"limit": min(limit, 100), "properties": "email,phone,firstname,lastname,company"}
        try:
            r = httpx.get(f"{_BASE}/crm/v3/objects/contacts", headers=self._headers(), params=params, timeout=30)
            r.raise_for_status()
            for c in r.json().get("results", []):
                p = c.get("properties", {})
                name = " ".join(x for x in [p.get("firstname"), p.get("lastname")] if x) or p.get("company")
                out.append({"name": name, "email": p.get("email"), "phone": p.get("phone"), "document": None})
        except httpx.HTTPError as exc:
            raise CrmError(f"HubSpot: erro ao puxar contatos ({exc}).")
        return out

    def push_deal(self, payload: dict) -> None:
        body = {"properties": {
            "dealname": f"{payload.get('customer_name')} — {payload.get('new_status')}",
            "amount": str(payload.get("expected_value") or 0),
            "dealstage": "closedwon" if payload.get("new_status") == "won" else "closedlost",
        }}
        try:
            r = httpx.post(f"{_BASE}/crm/v3/objects/deals", headers=self._headers(), json=body, timeout=15)
            r.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("crm.hubspot.push_error", extra={"error": str(exc)})
