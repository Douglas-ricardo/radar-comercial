#!/usr/bin/env python3
"""
Runner E2E do Radar Comercial — executado pelo Claude Code na maquina do dev.

NAO testa a UI clicando. Testa o FLUXO REAL via API, do jeito que um dev
verifica um produto: cria empresa, faz signup, sobe cada CSV de teste, espera
o processamento assincrono, busca os insights e VALIDA que os numeros fazem
sentido. Reporta verde/vermelho por etapa.

Pre-requisitos (o Claude Code garante antes de rodar):
  - Backend no ar em $RADAR_API (default http://localhost:8000/api)
  - Worker Celery rodando (senao o upload fica "processing" para sempre)
  - CSVs gerados por generate_test_csvs.py em ./test_csvs/
  - requests instalado (pip install requests)

Uso:
    python run_e2e.py

Variaveis de ambiente:
    RADAR_API   base da API (default http://localhost:8000/api)
    RADAR_CSV   pasta dos CSVs (default ./test_csvs)
"""

import os
import sys
import time
import json
import uuid
import requests

API = os.environ.get("RADAR_API", "http://localhost:8000/api").rstrip("/")
CSV_DIR = os.environ.get("RADAR_CSV", "test_csvs")
TIMEOUT = 10
POLL_MAX = 60          # tentativas
POLL_INTERVAL = 2      # segundos

# ── relatorio ──────────────────────────────────────────────────────────────
results = []  # (nome, status, detalhe)  status in {PASS, FAIL, WARN, INFO}


def record(name, status, detail=""):
    results.append((name, status, detail))
    icon = {"PASS": "✅", "FAIL": "❌", "WARN": "⚠️ ", "INFO": "ℹ️ "}[status]
    print(f"{icon} {name}" + (f" — {detail}" if detail else ""))


def fail_fatal(name, detail):
    record(name, "FAIL", detail)
    print_summary()
    sys.exit(1)


# ── sessao HTTP com cookie ─────────────────────────────────────────────────
s = requests.Session()


def post(path, **kw):
    return s.post(f"{API}{path}", timeout=TIMEOUT, **kw)


def get(path, **kw):
    return s.get(f"{API}{path}", timeout=TIMEOUT, **kw)


# ── 0. health ──────────────────────────────────────────────────────────────
def step_health():
    try:
        r = get("/status") if _exists("/status") else None
    except Exception:
        r = None
    # /status pode nao existir nesta versao; nao e fatal
    try:
        r = requests.get(f"{API.replace('/api','')}/health", timeout=TIMEOUT)
        if r.ok:
            record("health endpoint", "PASS", "/health responde")
            return
    except Exception:
        pass
    record("health endpoint", "INFO", "sem /health acessivel — seguindo")


def _exists(path):
    try:
        return get(path).status_code != 404
    except Exception:
        return False


# ── 1. signup ──────────────────────────────────────────────────────────────
def step_signup():
    email = f"e2e+{uuid.uuid4().hex[:8]}@radar-test.local"
    pwd = "TesteForte#2026"
    company = f"E2E Test Co {uuid.uuid4().hex[:4]}"
    r = post("/auth/signup", json={
        "name": "Dev E2E", "email": email, "password": pwd, "companyName": company,
    })
    if not r.ok:
        fail_fatal("signup", f"HTTP {r.status_code}: {r.text[:200]}")
    body = r.json()
    if not body.get("success", True):
        fail_fatal("signup", f"success=false: {body}")
    record("signup", "PASS", f"empresa criada ({email})")
    return email, pwd


# ── 2. login + /me ─────────────────────────────────────────────────────────
def step_login(email, pwd):
    r = post("/auth/login", json={"email": email, "password": pwd})
    if not r.ok:
        fail_fatal("login", f"HTTP {r.status_code}: {r.text[:200]}")
    record("login", "PASS", "cookie de sessao setado")
    r = get("/auth/me")
    if not r.ok:
        fail_fatal("/auth/me", f"HTTP {r.status_code}")
    me = r.json().get("data", r.json())
    company_id = (me.get("company") or {}).get("id") or me.get("company_id")
    if not company_id:
        fail_fatal("/auth/me", f"sem company_id no payload: {json.dumps(me)[:200]}")
    record("/auth/me", "PASS", f"company_id={company_id}")
    return company_id


# ── 3. upload + poll de status ─────────────────────────────────────────────
def upload_csv(path):
    fname = os.path.basename(path)
    with open(path, "rb") as f:
        r = post("/files/upload", files={"file": (fname, f, "text/csv")})
    return r


def poll_status(file_id):
    for _ in range(POLL_MAX):
        r = get(f"/files/{file_id}/status")
        if not r.ok:
            return "error", f"status HTTP {r.status_code}"
        data = r.json().get("data", r.json())
        st = data.get("status")
        if st in ("completed", "failed"):
            return st, data.get("error_message", "")
        time.sleep(POLL_INTERVAL)
    return "timeout", f"nao concluiu em {POLL_MAX*POLL_INTERVAL}s"


def step_upload_expect_success(path):
    fname = os.path.basename(path)
    r = upload_csv(path)
    if not r.ok:
        record(f"upload[{fname}]", "FAIL", f"HTTP {r.status_code}: {r.text[:150]}")
        return None
    fid = (r.json().get("data") or r.json()).get("file_id") or (r.json().get("data") or r.json()).get("id")
    if not fid:
        record(f"upload[{fname}]", "FAIL", f"sem file_id: {r.text[:150]}")
        return None
    st, msg = poll_status(fid)
    if st == "completed":
        record(f"upload[{fname}]", "PASS", "processado")
        return fid
    record(f"upload[{fname}]", "FAIL", f"status={st} {msg}")
    return None


def step_upload_expect_failure(path):
    """Cenario degenerado: o upload deve ser REJEITADO com erro claro,
    seja no POST (4xx) ou no processamento (status=failed com mensagem)."""
    fname = os.path.basename(path)
    r = upload_csv(path)
    if r.status_code >= 400:
        record(f"rejeita[{fname}]", "PASS", f"recusado no upload ({r.status_code})")
        return
    body = r.json().get("data") or r.json()
    fid = body.get("file_id") or body.get("id")
    if not fid:
        record(f"rejeita[{fname}]", "PASS", "recusado sem file_id")
        return
    st, msg = poll_status(fid)
    if st == "failed" and msg:
        record(f"rejeita[{fname}]", "PASS", f"falhou com mensagem: {msg[:80]}")
    elif st == "failed":
        record(f"rejeita[{fname}]", "WARN", "falhou mas SEM mensagem de erro util")
    elif st == "completed":
        record(f"rejeita[{fname}]", "FAIL", "PROCESSOU dado invalido (devia rejeitar)")
    else:
        record(f"rejeita[{fname}]", "WARN", f"status inesperado: {st} {msg}")


# ── 4. insights + validacoes semanticas ────────────────────────────────────
def step_insights(company_id, expect_fresh=None):
    r = get(f"/insights/{company_id}?date_range=6m")
    if not r.ok:
        record("insights", "FAIL", f"HTTP {r.status_code}: {r.text[:150]}")
        return None
    data = r.json().get("data", r.json())
    summary = data.get("summary", {})
    opps = data.get("opportunities", [])

    # 4.1 KPIs coerentes
    total = summary.get("totalRevenue", 0)
    if total and total > 0:
        record("insights.totalRevenue", "PASS", f"R$ {total:,.2f}")
    else:
        record("insights.totalRevenue", "WARN", f"totalRevenue={total} (esperava > 0)")

    # 4.2 oportunidades existem e tem as chaves camelCase corretas
    if opps:
        o = opps[0]
        chaves_ok = all(k in o for k in ("customer", "expectedValue", "daysInactive"))
        if chaves_ok:
            record("insights.opportunities.chaves", "PASS",
                   f"{len(opps)} opps, chaves camelCase OK")
        else:
            record("insights.opportunities.chaves", "FAIL",
                   f"chaves faltando — tem {list(o.keys())}")
        # 4.3 valores nao-zerados (o bug historico era tudo 0)
        ev = o.get("expectedValue", 0)
        di = o.get("daysInactive", 0)
        cust = o.get("customer", "")
        if ev and ev > 0 and di and di > 0 and cust and cust != "Cliente":
            record("insights.opportunities.valores", "PASS",
                   f"ex: {cust} / R$ {ev:,.2f} / {di} dias")
        else:
            record("insights.opportunities.valores", "FAIL",
                   f"valores vazios/zerados — cust={cust!r} ev={ev} di={di}")
    else:
        record("insights.opportunities", "WARN", "nenhuma oportunidade (esperava clientes inativos)")

    # 4.4 data_freshness, se exposto
    fresh = summary.get("dataFreshness") or data.get("dataFreshness") or summary.get("data_freshness")
    if fresh is not None:
        if expect_fresh == "live" and fresh == "live":
            record("insights.dataFreshness", "PASS", "live (dado recente)")
        elif expect_fresh == "stale" and "live" not in str(fresh):
            record("insights.dataFreshness", "PASS", f"marcado obsoleto: {fresh}")
        else:
            record("insights.dataFreshness", "INFO", f"valor={fresh}")
    else:
        record("insights.dataFreshness", "WARN",
               "dataFreshness NAO exposto no payload de insights (frontend nao consegue avisar dado velho)")

    return data


# ── 5. carteira (inclui o KeyError historico do ranking) ───────────────────
def step_carteira(company_id):
    r = get(f"/carteira/{company_id}")
    if not r.ok:
        record("carteira.list", "FAIL", f"HTTP {r.status_code}: {r.text[:150]}")
    else:
        record("carteira.list", "PASS", "lista de oportunidades OK")
    # ranking — era onde quebrava para analyst (KeyError user_id)
    r = get(f"/carteira/{company_id}/ranking")
    if r.ok:
        record("carteira.ranking", "PASS", "ranking responde (sem KeyError)")
    else:
        record("carteira.ranking", "FAIL", f"HTTP {r.status_code}: {r.text[:150]}")


# ── 6. IA: gerar mensagem (se houver oportunidade + key) ───────────────────
def step_ia(company_id, insights):
    opps = (insights or {}).get("opportunities", [])
    if not opps:
        record("ia.generate-message", "INFO", "sem oportunidade para testar IA")
        return
    opp_id = opps[0].get("customerHash") or opps[0].get("id")
    if not opp_id:
        record("ia.generate-message", "INFO", "oportunidade sem id para gerar mensagem")
        return
    r = post(f"/opportunities/{opp_id}/generate-message", json={"company_id": company_id})
    if r.ok:
        body = r.json().get("data", r.json())
        msg = body.get("message", "") if isinstance(body, dict) else str(body)
        if msg and len(msg) > 20:
            record("ia.generate-message", "PASS", f"texto gerado ({len(msg)} chars)")
        else:
            record("ia.generate-message", "WARN", "respondeu mas texto curto/vazio (fallback?)")
    else:
        record("ia.generate-message", "WARN",
               f"HTTP {r.status_code} — pode ser ANTHROPIC_API_KEY ausente: {r.text[:120]}")


# ── 7. notificacao de teste ────────────────────────────────────────────────
def step_notification():
    # garante prefs habilitadas
    s.patch(f"{API}/notifications/preferences",
            json={"enabled": True, "email_enabled": True}, timeout=TIMEOUT)
    r = post("/notifications/test-send", json={})
    if r.ok:
        record("notifications.test-send", "PASS", "disparo de teste aceito (cheque a caixa/log)")
    else:
        record("notifications.test-send", "WARN",
               f"HTTP {r.status_code} — pode ser RESEND ausente: {r.text[:120]}")


# ── 8. billing checkout (Stripe TEST mode) ─────────────────────────────────
def step_billing():
    r = post("/billing/create-checkout-session", json={"plan": "pro"})
    if r.ok:
        body = r.json().get("data", r.json())
        url = body.get("url") or body.get("checkout_url") if isinstance(body, dict) else None
        if url and "stripe.com" in str(url):
            record("billing.checkout", "PASS", "sessao Stripe TEST criada")
            record("billing.checkout.nota", "INFO",
                   "pague com cartao de teste 4242 4242 4242 4242 p/ validar webhook -> plano vira pro")
        else:
            record("billing.checkout", "WARN", f"resposta sem url Stripe: {str(body)[:120]}")
    else:
        record("billing.checkout", "WARN", f"HTTP {r.status_code}: {r.text[:120]}")


# ── resumo ─────────────────────────────────────────────────────────────────
def print_summary():
    print("\n" + "=" * 60)
    counts = {}
    for _, st, _ in results:
        counts[st] = counts.get(st, 0) + 1
    print("RESUMO E2E:",
          f"{counts.get('PASS',0)} PASS, {counts.get('FAIL',0)} FAIL, "
          f"{counts.get('WARN',0)} WARN, {counts.get('INFO',0)} INFO")
    fails = [(n, d) for n, st, d in results if st == "FAIL"]
    if fails:
        print("\nFALHAS QUE BLOQUEIAM:")
        for n, d in fails:
            print(f"  ❌ {n}: {d}")
    warns = [(n, d) for n, st, d in results if st == "WARN"]
    if warns:
        print("\nAVISOS (verificar, geralmente config externa):")
        for n, d in warns:
            print(f"  ⚠️  {n}: {d}")
    print("=" * 60)
    return counts


def main():
    print(f"E2E Radar Comercial — API={API}\n")
    step_health()
    email, pwd = step_signup()
    company_id = step_login(email, pwd)

    # Cenarios que DEVEM processar
    for fname, expect in [
        ("1_limpo.csv", None),
        ("2_ptbr_formato_br.csv", None),
        ("3_fresco_live.csv", "live"),
        ("4_historico_defasado.csv", "stale"),
        ("5_sujo_recuperavel.csv", None),
    ]:
        path = os.path.join(CSV_DIR, fname)
        if not os.path.exists(path):
            record(f"upload[{fname}]", "FAIL", "arquivo nao encontrado — rode generate_test_csvs.py")
            continue
        fid = step_upload_expect_success(path)
        if fid:
            insights = step_insights(company_id, expect_fresh=expect)
            if fname == "5_sujo_recuperavel.csv" and insights:
                step_ia(company_id, insights)

    # Cenarios degenerados que DEVEM ser rejeitados
    for fname in ["6a_sem_coluna_valor.csv", "6b_poucas_linhas.csv", "6c_revenue_nulo.csv"]:
        path = os.path.join(CSV_DIR, fname)
        if os.path.exists(path):
            step_upload_expect_failure(path)

    # Carteira, notificacao, billing (uma vez, no fim)
    step_carteira(company_id)
    step_notification()
    step_billing()

    counts = print_summary()
    sys.exit(1 if counts.get("FAIL", 0) else 0)


if __name__ == "__main__":
    main()
