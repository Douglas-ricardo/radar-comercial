"""Conector Salesforce — usa access_token + instance_url (OAuth). REST API."""
import logging

import httpx

from app.services.crm.base import CrmConnector, CrmError

logger = logging.getLogger(__name__)

_API_VERSION = "v59.0"


class SalesforceConnector(CrmConnector):
    provider = "salesforce"

    def _base(self) -> str:
        instance = self.credentials.get("instance_url")
        if not instance:
            raise CrmError("Salesforce: instance_url ausente.")
        return f"{instance.rstrip('/')}/services/data/{_API_VERSION}"

    def _headers(self) -> dict:
        token = self.credentials.get("access_token")
        if not token:
            raise CrmError("Salesforce: access_token ausente.")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def test_connection(self) -> bool:
        try:
            r = httpx.get(f"{self._base()}/limits", headers=self._headers(), timeout=15)
            r.raise_for_status()
            return True
        except httpx.HTTPError as exc:
            raise CrmError(f"Salesforce: falha de conexão ({exc}).")

    def fetch_contacts(self, limit: int = 200) -> list[dict]:
        out: list[dict] = []
        soql = f"SELECT Name, Email, Phone FROM Contact LIMIT {min(limit, 200)}"
        try:
            r = httpx.get(f"{self._base()}/query", headers=self._headers(), params={"q": soql}, timeout=30)
            r.raise_for_status()
            for c in r.json().get("records", []):
                out.append({"name": c.get("Name"), "email": c.get("Email"), "phone": c.get("Phone"), "document": None})
        except httpx.HTTPError as exc:
            raise CrmError(f"Salesforce: erro ao puxar contatos ({exc}).")
        return out

    def push_deal(self, payload: dict) -> None:
        body = {
            "Name": f"{payload.get('customer_name')} — {payload.get('new_status')}",
            "Amount": payload.get("expected_value") or 0,
            "StageName": "Closed Won" if payload.get("new_status") == "won" else "Closed Lost",
            "CloseDate": __import__("datetime").date.today().isoformat(),
        }
        try:
            r = httpx.post(f"{self._base()}/sobjects/Opportunity", headers=self._headers(), json=body, timeout=15)
            r.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("crm.salesforce.push_error", extra={"error": str(exc)})
