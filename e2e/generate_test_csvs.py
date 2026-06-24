#!/usr/bin/env python3
"""
Gerador de CSVs de teste para o Radar Comercial.

Produz 6 cenários progressivos, do mais limpo ao mais caótico, para exercitar
o ETL contra o tipo de dado que uma PME brasileira realmente entrega — não o
template limpo que nunca quebra nada.

Uso:
    python generate_test_csvs.py [pasta_saida]

Cada arquivo tem um proposito de teste documentado no proprio nome e no
cabecalho deste script. Os dados sao deterministicos (seed fixa) para que
rodadas repetidas produzam exatamente os mesmos arquivos — essencial para
testes reproduziveis.
"""

import csv
import os
import random
import sys
from datetime import date, timedelta

SEED = 42
random.seed(SEED)

OUT = sys.argv[1] if len(sys.argv) > 1 else "test_csvs"
os.makedirs(OUT, exist_ok=True)

# Ancora temporal: "hoje" do ponto de vista do teste.
# Usamos uma data fixa para reproducibilidade, mas os cenarios "frescos"
# colocam vendas perto de hoje-real para exercitar o guard de freshness (<=7 dias).
TODAY = date.today()

CLIENTES = [
    "Padaria Pao Quente Ltda", "Mercado Sao Jorge", "Auto Pecas Veloz",
    "Farmacia Bem Estar", "Restaurante Sabor Caseiro", "Papelaria Escreve Bem",
    "Construtora Alicerce", "Pet Shop Amigo Fiel", "Otica Visao Clara",
    "Floricultura Petala", "Acougue Boi Gordo", "Sorveteria Gelado",
    "Livraria Saber", "Lava Jato Brilho", "Hortifruti Verde Vida",
]
PRODUTOS = [
    "Servico Mensal", "Produto Premium", "Produto Standard", "Consultoria",
    "Kit Basico", "Plano Anual", "Manutencao", "Insumo A", "Insumo B",
]


def rand_date(start_days_ago, end_days_ago):
    """Data aleatoria entre start_days_ago e end_days_ago dias atras de TODAY."""
    delta = random.randint(end_days_ago, start_days_ago)
    return TODAY - timedelta(days=delta)


def br_money(value):
    """Formata como dinheiro BR: 1.234,56"""
    s = f"{value:,.2f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


# ──────────────────────────────────────────────────────────────────────────
# Cenario 1 — LIMPO. Colunas canonicas em ingles, datas ISO, ponto decimal.
# Proposito: baseline. Se isto falhar, o ETL esta quebrado no caso trivial.
# Inclui clientes recentes E inativos para gerar oportunidades.
# ──────────────────────────────────────────────────────────────────────────
def gen_clean(path):
    rows = [["date", "customer_id", "product_id", "qty", "revenue"]]
    # Clientes ativos (compra recente, <30 dias)
    for c in CLIENTES[:8]:
        for _ in range(random.randint(3, 8)):
            d = rand_date(180, 2)
            rows.append([d.isoformat(), c, random.choice(PRODUTOS),
                         random.randint(1, 20), f"{random.uniform(100, 5000):.2f}"])
    # Clientes inativos (ultima compra >60 dias atras) -> viram oportunidade
    for c in CLIENTES[8:]:
        for _ in range(random.randint(2, 5)):
            d = rand_date(365, 75)
            rows.append([d.isoformat(), c, random.choice(PRODUTOS),
                         random.randint(1, 20), f"{random.uniform(500, 8000):.2f}"])
    _write(path, rows)


# ──────────────────────────────────────────────────────────────────────────
# Cenario 2 — PORTUGUES + FORMATO BR. Colunas em pt, datas DD/MM/YYYY,
# valor com virgula decimal e separador de milhar. O caso PME-BR tipico.
# Proposito: testar normalizacao de colunas (sinonimos) e parsing BR.
# ──────────────────────────────────────────────────────────────────────────
def gen_ptbr(path):
    rows = [["Data Venda", "Cliente", "Produto", "Quantidade", "Valor"]]
    for c in CLIENTES:
        for _ in range(random.randint(2, 7)):
            d = rand_date(300, 5)
            rows.append([d.strftime("%d/%m/%Y"), c, random.choice(PRODUTOS),
                         str(random.randint(1, 15)), br_money(random.uniform(80, 6000))])
    _write(path, rows)


# ──────────────────────────────────────────────────────────────────────────
# Cenario 3 — FRESCO. Vendas concentradas nos ultimos 7 dias.
# Proposito: exercitar o guard de freshness. reference_date deve virar HOJE
# e data_freshness deve ser "live". Churn medido contra hoje.
# ──────────────────────────────────────────────────────────────────────────
def gen_fresh(path):
    rows = [["data", "cliente", "produto", "qtd", "valor"]]
    # Massa historica
    for c in CLIENTES:
        for _ in range(random.randint(3, 6)):
            d = rand_date(200, 30)
            rows.append([d.strftime("%d/%m/%Y"), c, random.choice(PRODUTOS),
                         str(random.randint(1, 10)), f"{random.uniform(100, 4000):.2f}"])
    # Vendas fresquissimas (ultimos 6 dias) para alguns clientes
    for c in CLIENTES[:5]:
        d = rand_date(6, 0)
        rows.append([d.strftime("%d/%m/%Y"), c, random.choice(PRODUTOS),
                     str(random.randint(1, 10)), f"{random.uniform(100, 4000):.2f}"])
    _write(path, rows)


# ──────────────────────────────────────────────────────────────────────────
# Cenario 4 — HISTORICO/DEFASADO. Ultima venda ha >7 dias (na verdade ~40).
# Proposito: o oposto do cenario 3. reference_date deve cair para file_max,
# data_freshness deve virar "ate DD/MM/YYYY". Verifica que o sistema AVISA
# que o dado e velho em vez de tratar como tempo real.
# ──────────────────────────────────────────────────────────────────────────
def gen_stale(path):
    rows = [["date", "customer", "product", "quantity", "value"]]
    for c in CLIENTES:
        for _ in range(random.randint(3, 8)):
            # nada mais novo que 40 dias atras
            d = rand_date(400, 40)
            rows.append([d.isoformat(), c, random.choice(PRODUTOS),
                         str(random.randint(1, 12)), f"{random.uniform(100, 5000):.2f}"])
    _write(path, rows)


# ──────────────────────────────────────────────────────────────────────────
# Cenario 5 — SUJO MAS RECUPERAVEL. O CSV que a PME real manda.
#   - cabecalho com espacos extras e maiusculas inconsistentes
#   - datas em DOIS formatos misturados na mesma coluna
#   - nomes de cliente com espacos a mais, caixa inconsistente
#   - linhas com valor zero e negativo (devem ser descartadas com aviso)
#   - uma linha de TOTAL no meio (lixo de export de Excel)
#   - linha em branco
#   - valor com R$ e com virgula
# Proposito: o teste de verdade. O ETL deve sobreviver, descartar lixo,
# normalizar, e ainda produzir insights coerentes.
# ──────────────────────────────────────────────────────────────────────────
def gen_dirty(path):
    rows = [["  Data ", "CLIENTE", "Produto ", "  Qtd", "Valor (R$)"]]
    fmts = ["%d/%m/%Y", "%Y-%m-%d"]
    for i, c in enumerate(CLIENTES):
        for _ in range(random.randint(2, 6)):
            d = rand_date(300, 5)
            fmt = fmts[i % 2]  # alterna formato de data por cliente
            name = c
            if i % 3 == 0:
                name = "  " + c.upper() + "  "  # espacos + maiuscula
            elif i % 3 == 1:
                name = c.lower()
            val = random.uniform(50, 7000)
            valstr = f"R$ {br_money(val)}" if i % 2 == 0 else f"{val:.2f}"
            rows.append([d.strftime(fmt), name, random.choice(PRODUTOS),
                         str(random.randint(1, 20)), valstr])
    # Lixo: linha de total
    rows.append(["", "TOTAL GERAL", "", "", "R$ 123.456,78"])
    # Lixo: linha em branco
    rows.append(["", "", "", "", ""])
    # Lixo: valor zero (deve ser descartado)
    rows.append([TODAY.strftime("%d/%m/%Y"), "Cliente Zero", "Produto Standard", "1", "0,00"])
    # Lixo: valor negativo (devolucao? deve ser descartado com aviso)
    rows.append([TODAY.strftime("%d/%m/%Y"), "Cliente Negativo", "Produto Standard", "1", "-500,00"])
    # Lixo: data futura (deve ser descartada)
    futura = TODAY + timedelta(days=30)
    rows.append([futura.strftime("%d/%m/%Y"), "Cliente Futuro", "Produto Premium", "1", "999,00"])
    _write(path, rows)


# ──────────────────────────────────────────────────────────────────────────
# Cenario 6 — DEGENERADO. Casos que DEVEM falhar com erro claro, nao crashar.
#   Gera 3 arquivos separados:
#   6a: faltando coluna obrigatoria (sem revenue)
#   6b: poucas linhas (abaixo do minimo de 5 validas)
#   6c: revenue com >50% de nulos (erro fatal esperado)
# Proposito: testar que validators.py rejeita com mensagem util,
# nao com stacktrace 500.
# ──────────────────────────────────────────────────────────────────────────
def gen_degenerate(folder):
    # 6a — sem coluna de valor
    _write(os.path.join(folder, "6a_sem_coluna_valor.csv"),
           [["data", "cliente", "produto", "qtd"]] +
           [[TODAY.isoformat(), c, "X", "1"] for c in CLIENTES[:6]])
    # 6b — poucas linhas
    _write(os.path.join(folder, "6b_poucas_linhas.csv"),
           [["date", "customer_id", "revenue"]] +
           [[TODAY.isoformat(), "Cliente Unico", "100.00"] for _ in range(3)])
    # 6c — revenue majoritariamente nulo
    rows = [["date", "customer_id", "revenue"]]
    for i in range(20):
        rev = "" if i % 3 != 0 else "100.00"  # ~66% nulos
        rows.append([(TODAY - timedelta(days=i)).isoformat(), CLIENTES[i % len(CLIENTES)], rev])
    _write(os.path.join(folder, "6c_revenue_nulo.csv"), rows)


def _write(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerows(rows)
    print(f"  gerado: {path} ({len(rows)-1} linhas de dados)")


if __name__ == "__main__":
    print(f"Gerando CSVs de teste em '{OUT}/' (TODAY={TODAY.isoformat()}, seed={SEED})\n")
    gen_clean(os.path.join(OUT, "1_limpo.csv"))
    gen_ptbr(os.path.join(OUT, "2_ptbr_formato_br.csv"))
    gen_fresh(os.path.join(OUT, "3_fresco_live.csv"))
    gen_stale(os.path.join(OUT, "4_historico_defasado.csv"))
    gen_dirty(os.path.join(OUT, "5_sujo_recuperavel.csv"))
    gen_degenerate(OUT)
    print(f"\nPronto. Cenarios 1-5 devem PROCESSAR; cenario 6 (a/b/c) deve FALHAR com erro claro.")
