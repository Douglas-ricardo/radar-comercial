"""
Isolamento multi-tenant — o invariante mais crítico do SaaS:
a empresa B NUNCA pode ler/alterar dados da empresa A.

Cada teste usa o cookie da empresa B tentando acessar recursos da empresa A
e exige 403 (acesso negado) ou 404 (não encontrado dentro do próprio tenant).
"""


def test_sem_cookie_retorna_401(client, company_a):
    """Rota protegida sem sessão → 401."""
    r = client.get(f"/api/insights/{company_a['company'].id}")
    assert r.status_code == 401


def test_insights_cross_tenant_403(client, company_a, company_b):
    """B não pode ver insights de A."""
    r = client.get(
        f"/api/insights/{company_a['company'].id}?date_range=6m",
        cookies=company_b["cookie"],
    )
    assert r.status_code == 403


def test_insights_proprio_tenant_ok(client, company_a):
    """A acessa o próprio company_id sem 403 (200, mesmo que sem dados computados)."""
    r = client.get(
        f"/api/insights/{company_a['company'].id}?date_range=6m",
        cookies=company_a["cookie"],
    )
    assert r.status_code == 200


def test_customers_cross_tenant_403(client, company_a, company_b):
    """B não pode ler perfil de cliente de A."""
    r = client.get(
        f"/api/customers/{company_a['company'].id}/{company_a['customer_hash']}",
        cookies=company_b["cookie"],
    )
    assert r.status_code == 403


def test_carteira_cross_tenant_403(client, company_a, company_b):
    """B não pode listar a carteira de A."""
    r = client.get(
        f"/api/carteira/{company_a['company'].id}",
        cookies=company_b["cookie"],
    )
    assert r.status_code == 403


def test_carteira_ranking_cross_tenant_403(client, company_a, company_b):
    """B não pode ver o ranking de A."""
    r = client.get(
        f"/api/carteira/{company_a['company'].id}/ranking",
        cookies=company_b["cookie"],
    )
    assert r.status_code == 403


def test_outreach_contacts_so_lista_proprio_tenant(client, company_a, company_b):
    """B lista contatos e NÃO vê o cliente de A (hash_a_001)."""
    r = client.get("/api/outreach/contacts", cookies=company_b["cookie"])
    assert r.status_code == 200
    hashes = {c["customerHash"] for c in r.json()["data"]}
    assert company_a["customer_hash"] not in hashes


def test_outreach_update_contato_cross_tenant_404(client, company_a, company_b):
    """B tentando editar contato de cliente de A → 404 (filtrado por company_id)."""
    r = client.patch(
        f"/api/outreach/contacts/{company_a['customer_hash']}",
        json={"contact_opt_out": True},
        cookies=company_b["cookie"],
    )
    assert r.status_code == 404


def test_scope_branch_filtra_carteira(client, scoped_analyst_sp):
    """Usuário com scope=branch:SP só vê clientes do branch SP, não RJ."""
    company_id = scoped_analyst_sp["company"].id
    r = client.get(f"/api/carteira/{company_id}", cookies=scoped_analyst_sp["cookie"])
    assert r.status_code == 200
    hashes = {opp["customerHash"] for opp in r.json()["data"]}
    assert "hash_scope_sp" in hashes
    assert "hash_scope_rj" not in hashes


def test_scope_admin_ve_todos_os_branches(client, scoped_analyst_sp, company_a):
    """Admin sem scope vê todos os clientes independente de filial."""
    company_id = scoped_analyst_sp["company"].id
    r = client.get(f"/api/carteira/{company_id}", cookies=company_a["cookie"])
    assert r.status_code == 200
    hashes = {opp["customerHash"] for opp in r.json()["data"]}
    assert "hash_scope_sp" in hashes
    assert "hash_scope_rj" in hashes


def test_outreach_config_isolada_por_empresa(client, company_a, company_b):
    """Cada empresa tem sua própria OutreachConfig (criada sob demanda)."""
    ra = client.get("/api/outreach/config", cookies=company_a["cookie"])
    rb = client.get("/api/outreach/config", cookies=company_b["cookie"])
    assert ra.status_code == 200 and rb.status_code == 200
    # ambas começam desconectadas e independentes
    assert ra.json()["data"]["whatsappStatus"] == "disconnected"
    assert rb.json()["data"]["whatsappStatus"] == "disconnected"
