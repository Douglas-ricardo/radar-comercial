# app/services/pdf_report.py
"""Geração do relatório de insights em PDF (fpdf2).

Roda no backend a partir do ComputedInsights já persistido — mesma fonte de
dados da tela de insights. Evita qualquer dependência de bundler no frontend.
"""
from __future__ import annotations

from datetime import datetime

from fpdf import FPDF

BRAND = (37, 99, 235)
MUTED = (100, 116, 139)
DARK = (15, 23, 42)
LIGHT = (248, 250, 252)
BORDER = (226, 232, 240)

TYPE_LABELS = {
    "missing_sale": "Venda perdida",
    "declining_customer": "Cliente em queda",
    "seasonal_gap": "Gap sazonal",
    "product_gap": "Gap de produto",
}
CONFIDENCE_LABELS = {"high": "Alta", "medium": "Media", "low": "Baixa"}
RANGE_LABELS = {
    "1m": "Ultimo mes",
    "3m": "Ultimos 3 meses",
    "6m": "Ultimos 6 meses",
    "12m": "Ultimo ano",
}


def _brl(value) -> str:
    try:
        v = float(value or 0)
    except (TypeError, ValueError):
        v = 0.0
    s = f"{v:,.2f}"
    # formato pt-BR: milhar com ponto, decimal com virgula
    s = s.replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {s}"


def _pct(value) -> str:
    try:
        v = float(value or 0)
    except (TypeError, ValueError):
        v = 0.0
    sign = "+" if v > 0 else ""
    return f"{sign}{v:.1f}%"


def _ascii(text) -> str:
    # fpdf2 com fontes core (helvetica) só aceita latin-1; normaliza com segurança.
    s = "" if text is None else str(text)
    return s.encode("latin-1", "replace").decode("latin-1")


class _Report(FPDF):
    def __init__(self, company_name: str):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.company_name = company_name
        self.set_auto_page_break(auto=True, margin=20)

    def header(self):
        self.set_fill_color(*BRAND)
        self.rect(0, 0, self.w, 28, "F")
        self.set_text_color(255, 255, 255)
        self.set_xy(14, 8)
        self.set_font("helvetica", "B", 18)
        self.cell(0, 8, "Radar Comercial", ln=1)
        self.set_x(14)
        self.set_font("helvetica", "", 11)
        self.cell(0, 6, "Relatorio de Insights Comerciais", ln=1)
        gen = datetime.now().strftime("%d/%m/%Y %H:%M")
        self.set_xy(-90, 16)
        self.set_font("helvetica", "", 9)
        self.cell(76, 6, f"Gerado em {gen}", align="R")
        self.set_y(38)

    def footer(self):
        self.set_y(-15)
        self.set_font("helvetica", "", 8)
        self.set_text_color(*MUTED)
        self.cell(0, 6, "Radar Comercial - relatorio confidencial")
        self.set_y(-15)
        self.cell(0, 6, f"Pagina {self.page_no()}/{{nb}}", align="R")

    def section_title(self, text: str):
        if self.get_y() > 250:
            self.add_page()
        self.set_text_color(*DARK)
        self.set_font("helvetica", "B", 12)
        self.cell(0, 8, _ascii(text), ln=1)
        self.ln(1)

    def table(self, headers, rows, widths, aligns=None):
        aligns = aligns or ["L"] * len(headers)
        line_h = 6
        # cabeçalho
        self.set_font("helvetica", "B", 8)
        self.set_fill_color(*BRAND)
        self.set_text_color(255, 255, 255)
        for h, w, a in zip(headers, widths, aligns):
            self.cell(w, line_h + 1, _ascii(h), border=0, align=a, fill=True)
        self.ln(line_h + 1)
        # linhas
        self.set_font("helvetica", "", 8)
        self.set_text_color(*DARK)
        for i, row in enumerate(rows):
            if self.get_y() > 270:
                self.add_page()
                self.set_font("helvetica", "B", 8)
                self.set_fill_color(*BRAND)
                self.set_text_color(255, 255, 255)
                for h, w, a in zip(headers, widths, aligns):
                    self.cell(w, line_h + 1, _ascii(h), align=a, fill=True)
                self.ln(line_h + 1)
                self.set_font("helvetica", "", 8)
                self.set_text_color(*DARK)
            fill = i % 2 == 1
            if fill:
                self.set_fill_color(*LIGHT)
            for val, w, a in zip(row, widths, aligns):
                self.cell(w, line_h, _ascii(val), align=a, fill=fill)
            self.ln(line_h)
        self.ln(4)


def build_insights_pdf(
    company_name: str,
    date_range: str,
    summary: dict,
    opportunities: list,
    charts: dict,
) -> bytes:
    summary = summary or {}
    opportunities = opportunities or []
    charts = charts or {}

    pdf = _Report(company_name)
    pdf.alias_nb_pages()
    pdf.add_page()

    # ── Identificação ─────────────────────────────────────────────────────────
    pdf.set_text_color(*DARK)
    pdf.set_font("helvetica", "B", 13)
    pdf.cell(0, 7, _ascii(company_name or "Empresa"), ln=1)
    pdf.set_font("helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 5, _ascii(f"Periodo analisado: {RANGE_LABELS.get(date_range, date_range)}"), ln=1)
    freshness = summary.get("dataFreshness")
    if freshness and freshness != "live":
        pdf.set_text_color(180, 83, 9)
        pdf.cell(0, 5, _ascii(f"Atencao: dados {freshness}. Faca um upload mais recente para atualizar."), ln=1)
    pdf.ln(4)

    # ── Resumo executivo (KPIs) ───────────────────────────────────────────────
    pdf.section_title("Resumo executivo")
    kpis = [
        ("Receita total", _brl(summary.get("totalRevenue"))),
        ("Receita perdida", _brl(summary.get("lostRevenue"))),
        ("Taxa de perda", f"{float(summary.get('lostRate') or 0):.1f}%"),
        ("Crescimento", _pct(summary.get("revenueGrowth"))),
        ("Clientes unicos", str(summary.get("uniqueCustomers") or 0)),
        ("Produtos unicos", str(summary.get("uniqueProducts") or 0)),
    ]
    card_w = (pdf.w - 28 - 8) / 3
    card_h = 18
    start_x = 14
    start_y = pdf.get_y()
    for i, (label, value) in enumerate(kpis):
        col = i % 3
        rowi = i // 3
        cx = start_x + col * (card_w + 4)
        cy = start_y + rowi * (card_h + 4)
        pdf.set_draw_color(*BORDER)
        pdf.set_fill_color(*LIGHT)
        pdf.rect(cx, cy, card_w, card_h, "DF")
        pdf.set_xy(cx + 3, cy + 3)
        pdf.set_font("helvetica", "", 8)
        pdf.set_text_color(*MUTED)
        pdf.cell(card_w - 6, 5, _ascii(label))
        pdf.set_xy(cx + 3, cy + 9)
        pdf.set_font("helvetica", "B", 12)
        pdf.set_text_color(*DARK)
        pdf.cell(card_w - 6, 7, _ascii(value))
    pdf.set_y(start_y + 2 * (card_h + 4) + 4)

    # ── Oportunidades ─────────────────────────────────────────────────────────
    pdf.section_title(f"Oportunidades de recuperacao ({len(opportunities)})")
    if opportunities:
        rows = [
            [
                o.get("customer", "-"),
                TYPE_LABELS.get(o.get("type"), o.get("type", "-")),
                o.get("product") or "-",
                o.get("lastPurchase") or "-",
                _brl(o.get("expectedValue")),
                CONFIDENCE_LABELS.get(o.get("confidence"), o.get("confidence", "-")),
            ]
            for o in opportunities
        ]
        pdf.table(
            ["Cliente", "Tipo", "Ultimo produto", "Ult. compra", "Valor esperado", "Confianca"],
            rows,
            [42, 28, 38, 24, 30, 20],
            ["L", "L", "L", "C", "R", "C"],
        )
    else:
        pdf.set_font("helvetica", "", 9)
        pdf.set_text_color(*MUTED)
        pdf.cell(0, 6, _ascii("Nenhuma oportunidade identificada no periodo."), ln=1)
        pdf.ln(2)

    # ── Top clientes ──────────────────────────────────────────────────────────
    customers = charts.get("customerDistribution") or []
    if customers:
        pdf.section_title("Principais clientes por receita")
        rows = [
            [
                c.get("name", "-"),
                _brl(c.get("value")),
                f"{float(c.get('percentage') or 0):.1f}%",
                {"up": "Crescendo", "down": "Em queda"}.get(c.get("trend"), "Estavel"),
            ]
            for c in customers[:15]
        ]
        pdf.table(
            ["Cliente", "Receita", "% do total", "Tendencia"],
            rows,
            [80, 38, 30, 34],
            ["L", "R", "R", "C"],
        )

    # ── Gaps de produto ───────────────────────────────────────────────────────
    gaps = charts.get("productGaps") or []
    if gaps:
        pdf.section_title("Gaps de produto")
        rows = [[g.get("produto", "-"), _brl(g.get("gap"))] for g in gaps[:15]]
        pdf.table(["Produto", "Gap estimado"], rows, [120, 62], ["L", "R"])

    # ── Evolução mensal ───────────────────────────────────────────────────────
    series = charts.get("timeSeries") or []
    if series:
        pdf.section_title("Evolucao mensal")
        rows = [[p.get("month", "-"), _brl(p.get("receita")), _brl(p.get("perdida"))] for p in series]
        pdf.table(["Mes", "Receita", "Receita perdida"], rows, [62, 60, 60], ["L", "R", "R"])

    out = pdf.output()
    return bytes(out)
