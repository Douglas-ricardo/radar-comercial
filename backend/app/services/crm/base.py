"""Framework de conectores CRM — interface comum + factory.

Cada provider implementa autenticação por token (API token / private app / OAuth
access token), pull de contatos e push de negócio (deal). Os contatos puxados
enriquecem CustomerProfile (telefone/e-mail) casando por e-mail/documento/nome.
"""
import json
import logging
from abc import ABC, abstractmethod

from app.core import crypto

logger = logging.getLogger(__name__)


class CrmError(Exception):
    pass


class CrmConnector(ABC):
    provider: str = "base"

    def __init__(self, credentials: dict, field_map: dict | None = None):
        self.credentials = credentials
        self.field_map = field_map or {}

    @abstractmethod
    def test_connection(self) -> bool:
        """Valida as credenciais contra a API do CRM. Levanta CrmError em falha."""

    @abstractmethod
    def fetch_contacts(self, limit: int = 200) -> list[dict]:
        """Retorna contatos normalizados: {name, email, phone, document}."""

    @abstractmethod
    def push_deal(self, payload: dict) -> None:
        """Empurra um negócio (won/lost) ao CRM. Best-effort."""


def encrypt_credentials(data: dict) -> str:
    return crypto.encrypt(json.dumps(data))


def decrypt_credentials(blob: str) -> dict:
    raw = crypto.decrypt(blob)
    return json.loads(raw) if raw else {}


def get_connector(provider: str, credentials: dict, field_map: dict | None = None) -> CrmConnector:
    from app.services.crm.hubspot import HubSpotConnector
    from app.services.crm.pipedrive import PipedriveConnector
    from app.services.crm.salesforce import SalesforceConnector

    mapping = {
        "hubspot": HubSpotConnector,
        "pipedrive": PipedriveConnector,
        "salesforce": SalesforceConnector,
    }
    cls = mapping.get(provider)
    if not cls:
        raise CrmError(f"Provider CRM não suportado: {provider}")
    return cls(credentials, field_map)
