"""
RBAC — limites de acesso por papel (admin / analyst / viewer) e fluxo de senha
temporária (status=pending → set-password → active).

Invariantes:
- Rotas admin-only (faturamento, integrações/API keys, equipe) devem retornar 403
  para analista e viewer.
- Rotas de disparo (PII do cliente final) liberadas a admin+analyst, negadas a viewer.
- Usuário pending só consegue trocar a senha via /set-password; depois vira active.
"""


# ─── Faturamento — admin only ────────────────────────────────────────────────

def test_analyst_nao_cria_checkout(client, analyst_a):
    r = client.post(
        "/api/billing/create-checkout-session",
        json={"plan": "pro"},
        cookies=analyst_a["cookie"],
    )
    assert r.status_code == 403


def test_viewer_nao_cria_checkout(client, viewer_b):
    r = client.post(
        "/api/billing/create-checkout-session",
        json={"plan": "pro"},
        cookies=viewer_b["cookie"],
    )
    assert r.status_code == 403


# ─── Integrações / API Keys — admin only ─────────────────────────────────────

def test_analyst_nao_lista_api_keys(client, analyst_a):
    r = client.get("/api/integrations/keys", cookies=analyst_a["cookie"])
    assert r.status_code == 403


def test_analyst_nao_cria_api_key(client, analyst_a):
    r = client.post(
        "/api/integrations/keys",
        json={"name": "minha-key"},
        cookies=analyst_a["cookie"],
    )
    assert r.status_code == 403


def test_viewer_nao_ve_sync_status(client, viewer_b):
    r = client.get("/api/integrations/sync/status", cookies=viewer_b["cookie"])
    assert r.status_code == 403


# ─── Disparo — admin+analyst, viewer negado ──────────────────────────────────

def test_analyst_acessa_config_disparo(client, analyst_a):
    r = client.get("/api/outreach/config", cookies=analyst_a["cookie"])
    assert r.status_code == 200


def test_viewer_nao_acessa_config_disparo(client, viewer_b):
    r = client.get("/api/outreach/config", cookies=viewer_b["cookie"])
    assert r.status_code == 403


def test_viewer_nao_lista_contatos_disparo(client, viewer_b):
    r = client.get("/api/outreach/contacts", cookies=viewer_b["cookie"])
    assert r.status_code == 403


def test_analyst_conecta_whatsapp(client, analyst_a):
    """Conectar WhatsApp é do comercial (analista) — não pode ser 403.

    Sem Evolution API configurada o handler retorna 503; o que importa aqui é
    que o analista passa pelo guard de role (não recebe 403).
    """
    r = client.post("/api/outreach/whatsapp/connect", cookies=analyst_a["cookie"])
    assert r.status_code != 403


def test_viewer_nao_conecta_whatsapp(client, viewer_b):
    """Viewer continua bloqueado de conectar o WhatsApp."""
    r = client.post("/api/outreach/whatsapp/connect", cookies=viewer_b["cookie"])
    assert r.status_code == 403


# ─── Geração de mensagem por IA — admin+analyst, viewer negado (custo) ────────

def test_viewer_nao_gera_mensagem_ia(client, viewer_b):
    """Viewer não pode disparar custo de IA (Anthropic Haiku)."""
    r = client.post(
        "/api/opportunities/op_x/generate-message",
        json={"customer_hash": "nonexistent_hash", "date_range": "1m"},
        cookies=viewer_b["cookie"],
    )
    assert r.status_code == 403


def test_analyst_passa_guard_geracao_ia(client, analyst_a):
    """Analista passa pelo guard de role (não recebe 403).

    customer_hash inexistente garante que não há chamada real à IA: sem
    ANTHROPIC_API_KEY → 503; com key → 404 (perfil não encontrado). Nunca 403.
    """
    r = client.post(
        "/api/opportunities/op_x/generate-message",
        json={"customer_hash": "nonexistent_hash", "date_range": "1m"},
        cookies=analyst_a["cookie"],
    )
    assert r.status_code != 403


# ─── Fluxo de senha temporária (pending → active) ────────────────────────────

def test_login_pending_sinaliza_troca_de_senha(client, db, pending_user_a):
    user = pending_user_a["user"]
    r = client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "Teste123"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["data"]["requiresPasswordChange"] is True
    assert body["data"]["user"]["status"] == "pending"


def test_set_password_ativa_conta(client, db, pending_user_a):
    user = pending_user_a["user"]
    r = client.post(
        "/api/auth/set-password",
        json={"new_password": "NovaSenha123"},
        cookies=pending_user_a["cookie"],
    )
    assert r.status_code == 200
    assert r.json()["success"] is True

    db.refresh(user)
    assert user.status == "active"


def test_set_password_recusa_conta_ja_ativa(client, analyst_a):
    """Usuário já ativo não pode usar /set-password (usa change-password)."""
    r = client.post(
        "/api/auth/set-password",
        json={"new_password": "OutraSenha123"},
        cookies=analyst_a["cookie"],
    )
    assert r.status_code == 400


def test_set_password_valida_forca(client, pending_user_a):
    """Senha fraca é rejeitada antes de ativar."""
    r = client.post(
        "/api/auth/set-password",
        json={"new_password": "123"},
        cookies=pending_user_a["cookie"],
    )
    assert r.status_code == 400
