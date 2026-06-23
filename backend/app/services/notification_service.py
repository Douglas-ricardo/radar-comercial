# app/services/notification_service.py
import logging
import os
from typing import Dict, List

logger = logging.getLogger(__name__)


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
        user_name: str, opportunities: List[Dict], company_name: str
    ) -> str:
        app_url = os.getenv("APP_BASE_URL", "http://localhost:3000")
        rows = ""
        for opp in opportunities[:10]:
            customer = opp.get("customer", "Cliente")
            value = opp.get("expectedValue", 0)
            days = opp.get("daysInactive", 0)
            rows += (
                f"<tr>"
                f"<td style='padding:8px;border-bottom:1px solid #eee'>{customer}</td>"
                f"<td style='padding:8px;border-bottom:1px solid #eee;color:#e53e3e'>{days} dias sem comprar</td>"
                f"<td style='padding:8px;border-bottom:1px solid #eee;color:#38a169;font-weight:bold'>"
                f"R$ {value:,.2f}</td>"
                f"</tr>"
            )

        return f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#1a1a2e">Radar Comercial — Oportunidades do dia</h2>
          <p>Olá {user_name}, aqui estão as oportunidades de recuperação para hoje:</p>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:#f7f7f7">
                <th style="padding:8px;text-align:left">Cliente</th>
                <th style="padding:8px;text-align:left">Situação</th>
                <th style="padding:8px;text-align:left">Valor esperado</th>
              </tr>
            </thead>
            <tbody>{rows}</tbody>
          </table>
          <p style="margin-top:24px">
            <a href="{app_url}/dashboard/insights"
               style="background:#4F46E5;color:white;padding:12px 24px;text-decoration:none;border-radius:6px">
              Ver todas as oportunidades
            </a>
          </p>
          <p style="color:#888;font-size:12px;margin-top:32px">
            Para ajustar notificações acesse Configurações &gt; Notificações.<br>{company_name}
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
    def format_opportunity_whatsapp(user_name: str, opportunities: List[Dict]) -> str:
        app_url = os.getenv("APP_BASE_URL", "http://localhost:3000")
        lines = [f"Olá {user_name}! 📊 *Radar Comercial* — oportunidades de hoje:\n"]
        for opp in opportunities[:5]:
            customer = opp.get("customer", "Cliente")
            value = opp.get("expectedValue", 0)
            days = opp.get("daysInactive", 0)
            lines.append(f"• *{customer}* — {days} dias sem comprar — R$ {value:,.2f}")
        lines.append(f"\nVer mais: {app_url}/dashboard/insights")
        return "\n".join(lines)

    @staticmethod
    def send_invite_email(
        to_email: str,
        inviter_name: str,
        company_name: str,
        temp_password: str,
    ) -> bool:
        app_url = os.getenv("APP_BASE_URL", "http://localhost:3000")
        subject = f"Você foi convidado para o Radar Comercial — {company_name}"
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#1a1a2e">Bem-vindo ao Radar Comercial</h2>
          <p><strong>{inviter_name}</strong> convidou você para acessar o Radar Comercial
             da empresa <strong>{company_name}</strong>.</p>
          <div style="background:#f7f7f7;padding:16px;border-radius:8px;margin:16px 0">
            <p style="margin:0"><strong>Email:</strong> {to_email}</p>
            <p style="margin:8px 0 0"><strong>Senha temporária:</strong> {temp_password}</p>
          </div>
          <p>Por segurança, altere sua senha após o primeiro login.</p>
          <p style="margin-top:24px">
            <a href="{app_url}/login"
               style="background:#4F46E5;color:white;padding:12px 24px;text-decoration:none;border-radius:6px">
              Acessar o Radar Comercial
            </a>
          </p>
        </div>
        """
        return NotificationService.send_email(to_email, subject, html)
