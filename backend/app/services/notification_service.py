# app/services/notification_service.py
import logging
import os
from typing import Dict, List

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers de formatação (compartilhados pelos templates de email/WhatsApp).
# ─────────────────────────────────────────────────────────────────────────────

_CURRENCY_SYMBOLS = {
    "BRL": "R$", "USD": "US$", "EUR": "€", "GBP": "£",
    "ARS": "$", "MXN": "$", "CLP": "$", "COP": "$", "PYG": "₲", "UYU": "$U",
}


def format_money(value, currency: str = "BRL") -> str:
    """Formata valor monetário no padrão pt-BR (milhar com ponto, decimal com vírgula),
    respeitando a moeda da empresa. Ex.: format_money(1234.5) -> 'R$ 1.234,50'."""
    try:
        v = float(value or 0)
    except (TypeError, ValueError):
        v = 0.0
    code = (currency or "BRL").upper()
    symbol = _CURRENCY_SYMBOLS.get(code, code)
    # 1,234.56 (US) -> 1.234,56 (pt-BR) via placeholder
    br = f"{v:,.2f}".replace(",", "\x00").replace(".", ",").replace("\x00", ".")
    return f"{symbol} {br}"


# Faixa de recuperabilidade → (cor do texto, cor de fundo, rótulo) para badges HTML.
_BAND_STYLE = {
    "alta": ("#15803d", "#dcfce7", "Alta"),
    "media": ("#a16207", "#fef9c3", "Média"),
    "baixa": ("#4b5563", "#f3f4f6", "Baixa"),
}
_BAND_EMOJI = {"alta": "🟢", "media": "🟡", "baixa": "⚪"}


class NotificationService:

    @staticmethod
    def send_email(to: str, subject: str, html: str) -> bool:
        api_key = os.getenv("RESEND_API_KEY")
        if not api_key:
            logger.warning("notification.email.resend_not_configured")
            return False
        try:
            import resend
            resend.api_key = api_key
            from_email = os.getenv(
                "RESEND_FROM_EMAIL",
                "Radar Comercial <noreply@radarcomercial.com.br>",
            )
            resend.Emails.send({"from": from_email, "to": [to], "subject": subject, "html": html})
            logger.info("notification.email.sent", extra={"to": to})
            return True
        except Exception as exc:
            logger.error("notification.email.error", extra={"to": to, "error": str(exc)})
            return False

    @staticmethod
    def send_whatsapp(to_phone: str, message: str) -> bool:
        """Envia mensagem via WhatsApp Cloud API (Meta).

        Requer:
          WHATSAPP_API_TOKEN      — token permanente gerado no Meta Business
          WHATSAPP_PHONE_NUMBER_ID — ID do número registrado no painel Meta
        O número de destino deve estar no formato E.164 (ex: +5511999999999).
        """
        api_token = os.getenv("WHATSAPP_API_TOKEN")
        phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID")

        if not all([api_token, phone_number_id]):
            logger.warning("notification.whatsapp.not_configured")
            return False

        # normaliza para E.164 — remove "whatsapp:" se vier do campo legacy
        to_e164 = to_phone.replace("whatsapp:", "").strip()
        if not to_e164.startswith("+"):
            to_e164 = f"+{to_e164}"

        url = f"https://graph.facebook.com/v19.0/{phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        }
        payload = {
            "messaging_product": "whatsapp",
            "to": to_e164,
            "type": "text",
            "text": {"preview_url": False, "body": message},
        }

        try:
            import httpx
            response = httpx.post(url, headers=headers, json=payload, timeout=15)
            response.raise_for_status()
            logger.info("notification.whatsapp.sent", extra={"to": to_e164})
            return True
        except Exception as exc:
            logger.error("notification.whatsapp.error", extra={"to": to_e164, "error": str(exc)})
            return False

    @staticmethod
    def format_opportunity_email(
        user_name: str, opportunities: List[Dict], company_name: str, currency: str = "BRL"
    ) -> str:
        app_url = os.getenv("APP_BASE_URL", "http://localhost:3000").rstrip("/")
        top = opportunities[:10]
        total = sum(float(o.get("expectedValue", 0) or 0) for o in opportunities)
        count = len(opportunities)
        first_name = (user_name or "").split(" ")[0] or "time"

        rows = ""
        for i, opp in enumerate(top):
            customer = opp.get("customer", "Cliente")
            value = opp.get("expectedValue", 0)
            days = opp.get("daysInactive", 0)
            product = opp.get("product") or ""
            band = (opp.get("recoveryBand") or "baixa").lower()
            fg, bg, label = _BAND_STYLE.get(band, _BAND_STYLE["baixa"])
            product_line = (
                f"<div style='color:#6b7280;font-size:12px;margin-top:2px'>Último: {product}</div>"
                if product and product != "Produto não identificado" else ""
            )
            zebra = "#ffffff" if i % 2 == 0 else "#fafbfc"
            rows += f"""
              <tr style="background:{zebra}">
                <td style="padding:12px 14px;border-bottom:1px solid #eef0f2">
                  <div style="font-weight:600;color:#1a1a2e">{customer}</div>{product_line}
                </td>
                <td style="padding:12px 14px;border-bottom:1px solid #eef0f2;color:#dc2626;white-space:nowrap">
                  {days} dias sem comprar
                </td>
                <td style="padding:12px 14px;border-bottom:1px solid #eef0f2;text-align:center">
                  <span style="display:inline-block;background:{bg};color:{fg};font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px">{label}</span>
                </td>
                <td style="padding:12px 14px;border-bottom:1px solid #eef0f2;text-align:right;color:#15803d;font-weight:700;white-space:nowrap">
                  {format_money(value, currency)}
                </td>
              </tr>"""

        restante = count - len(top)
        mais = (
            f"<p style='text-align:center;color:#6b7280;font-size:13px;margin:16px 0 0'>"
            f"+ {restante} outras oportunidades no painel</p>" if restante > 0 else ""
        )

        return f"""
        <div style="background:#f6f7f9;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
          <div style="display:none;max-height:0;overflow:hidden;color:#f6f7f9">
            {count} oportunidades somam {format_money(total, currency)} recuperáveis hoje.
          </div>
          <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #eef0f2">
            <div style="padding:24px 24px 20px">
              <div style="color:#4F46E5;font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">Radar Comercial</div>
              <h1 style="margin:6px 0 4px;font-size:20px;color:#1a1a2e">Oportunidades do dia</h1>
              <p style="margin:0;color:#6b7280;font-size:14px">Olá, {first_name}. Priorizamos o que rende mais se você agir hoje.</p>
            </div>
            <div style="margin:0 24px;padding:16px 18px;background:#f5f3ff;border:1px solid #e0e7ff;border-radius:10px">
              <div style="color:#4F46E5;font-size:12px;font-weight:600">Potencial recuperável</div>
              <div style="color:#1a1a2e;font-size:26px;font-weight:800;margin-top:2px">{format_money(total, currency)}</div>
              <div style="color:#6b7280;font-size:13px;margin-top:2px">em {count} {'cliente' if count == 1 else 'clientes'} para reativar</div>
            </div>
            <table style="width:100%;border-collapse:collapse;margin-top:16px">
              <thead>
                <tr style="background:#fafbfc">
                  <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px">Cliente</th>
                  <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px">Situação</th>
                  <th style="padding:10px 14px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px">Recuperabilidade</th>
                  <th style="padding:10px 14px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px">Valor</th>
                </tr>
              </thead>
              <tbody>{rows}</tbody>
            </table>
            <div style="padding:0 24px">{mais}</div>
            <div style="padding:24px;text-align:center">
              <a href="{app_url}/dashboard/insights"
                 style="display:inline-block;background:#4F46E5;color:#ffffff;padding:13px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">
                Ver todas as oportunidades
              </a>
            </div>
          </div>
          <p style="max-width:600px;margin:16px auto 0;color:#9ca3af;font-size:12px;text-align:center;line-height:1.5">
            {company_name} · Radar Comercial<br>
            Para ajustar a frequência ou desativar, acesse Configurações &gt; Notificações.
          </p>
        </div>
        """

    @staticmethod
    def send_email_with_attachment(
        to: str,
        subject: str,
        html: str,
        attachment_bytes: bytes,
        attachment_name: str,
        attachment_type: str,
    ) -> bool:
        """Envia email com anexo binário via Resend (base64 encoded)."""
        import base64
        api_key = os.getenv("RESEND_API_KEY")
        if not api_key:
            logger.warning("notification.email.resend_not_configured")
            return False
        try:
            import resend
            resend.api_key = api_key
            from_email = os.getenv(
                "RESEND_FROM_EMAIL",
                "Radar Comercial <noreply@radarcomercial.com.br>",
            )
            resend.Emails.send({
                "from": from_email,
                "to": [to],
                "subject": subject,
                "html": html,
                "attachments": [{
                    "filename": attachment_name,
                    "content": base64.b64encode(attachment_bytes).decode(),
                    "type": attachment_type,
                }],
            })
            logger.info("notification.email_attachment.sent", extra={"to": to})
            return True
        except Exception as exc:
            logger.error("notification.email_attachment.error", extra={"to": to, "error": str(exc)})
            return False

    @staticmethod
    def format_opportunity_whatsapp(
        user_name: str, opportunities: List[Dict], currency: str = "BRL"
    ) -> str:
        app_url = os.getenv("APP_BASE_URL", "http://localhost:3000").rstrip("/")
        first_name = (user_name or "").split(" ")[0] or "time"
        total = sum(float(o.get("expectedValue", 0) or 0) for o in opportunities)
        count = len(opportunities)

        lines = [
            f"📊 *Radar Comercial* — oportunidades de hoje",
            f"Olá, {first_name}! Você tem *{count} {'cliente' if count == 1 else 'clientes'}* "
            f"para reativar, somando *{format_money(total, currency)}* recuperáveis.",
            "",
        ]
        for opp in opportunities[:5]:
            customer = opp.get("customer", "Cliente")
            value = opp.get("expectedValue", 0)
            days = opp.get("daysInactive", 0)
            band = (opp.get("recoveryBand") or "baixa").lower()
            emoji = _BAND_EMOJI.get(band, "⚪")
            product = opp.get("product") or ""
            extra = f" ({product})" if product and product != "Produto não identificado" else ""
            lines.append(
                f"{emoji} *{customer}*{extra}\n"
                f"   {days} dias sem comprar · {format_money(value, currency)}"
            )

        restante = count - min(count, 5)
        if restante > 0:
            lines.append(f"\n_+ {restante} no painel_")
        lines.append(f"\n👉 {app_url}/dashboard/insights")
        return "\n".join(lines)

    @staticmethod
    def send_invite_email(
        to_email: str,
        inviter_name: str,
        company_name: str,
        temp_password: str,
    ) -> bool:
        app_url = os.getenv("APP_BASE_URL", "http://localhost:3000").rstrip("/")
        subject = f"Você foi convidado para o Radar Comercial — {company_name}"
        html = f"""
        <div style="background:#f6f7f9;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
          <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #eef0f2">
            <div style="padding:26px 28px 8px">
              <div style="color:#4F46E5;font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">Radar Comercial</div>
              <h1 style="margin:8px 0 6px;font-size:21px;color:#1a1a2e">Seu acesso está pronto</h1>
              <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6">
                <strong>{inviter_name}</strong> convidou você para acessar o Radar Comercial
                da empresa <strong>{company_name}</strong>.
              </p>
            </div>
            <div style="margin:20px 28px;padding:18px 20px;background:#f9fafb;border:1px solid #eef0f2;border-radius:10px">
              <div style="color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.4px">Seus dados de acesso</div>
              <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:15px">
                <tr>
                  <td style="padding:6px 0;color:#6b7280;width:150px">E-mail</td>
                  <td style="padding:6px 0;color:#1a1a2e;font-weight:600">{to_email}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#6b7280">Senha temporária</td>
                  <td style="padding:6px 0;color:#1a1a2e;font-weight:700;font-family:'SF Mono',Menlo,Consolas,monospace">{temp_password}</td>
                </tr>
              </table>
            </div>
            <div style="padding:0 28px;text-align:center">
              <a href="{app_url}/login"
                 style="display:inline-block;background:#4F46E5;color:#ffffff;padding:13px 30px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">
                Acessar o Radar Comercial
              </a>
            </div>
            <p style="margin:20px 28px 0;padding:12px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;color:#92400e;font-size:13px;line-height:1.5">
              Por segurança, altere sua senha logo após o primeiro login. Nunca compartilhe estes dados.
            </p>
            <div style="padding:22px 28px 26px"></div>
          </div>
          <p style="max-width:560px;margin:16px auto 0;color:#9ca3af;font-size:12px;text-align:center;line-height:1.5">
            {company_name} · Radar Comercial<br>
            Se você não esperava este convite, ignore este e-mail.
          </p>
        </div>
        """
        return NotificationService.send_email(to_email, subject, html)
