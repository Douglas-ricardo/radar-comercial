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
        account_sid = os.getenv("TWILIO_ACCOUNT_SID")
        auth_token = os.getenv("TWILIO_AUTH_TOKEN")
        from_number = os.getenv("TWILIO_WHATSAPP_FROM")

        if not all([account_sid, auth_token, from_number]):
            logger.warning("notification.whatsapp.twilio_not_configured")
            return False
        try:
            from twilio.rest import Client
            client = Client(account_sid, auth_token)
            to_wa = to_phone if to_phone.startswith("whatsapp:") else f"whatsapp:{to_phone}"
            client.messages.create(from_=from_number, to=to_wa, body=message)
            logger.info("notification.whatsapp.sent", extra={"to": to_phone})
            return True
        except Exception as exc:
            logger.error("notification.whatsapp.error", extra={"to": to_phone, "error": str(exc)})
            return False

    @staticmethod
    def format_opportunity_email(
        user_name: str, opportunities: List[Dict], company_name: str
    ) -> str:
        app_url = os.getenv("APP_BASE_URL", "http://localhost:3000")
        rows = ""
        for opp in opportunities[:10]:
            customer = opp.get("customer_name", "Cliente")
            value = opp.get("expected_value", 0)
            days = opp.get("days_inactive", 0)
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
    def format_opportunity_whatsapp(user_name: str, opportunities: List[Dict]) -> str:
        app_url = os.getenv("APP_BASE_URL", "http://localhost:3000")
        lines = [f"Olá {user_name}! 📊 *Radar Comercial* — oportunidades de hoje:\n"]
        for opp in opportunities[:5]:
            customer = opp.get("customer_name", "Cliente")
            value = opp.get("expected_value", 0)
            days = opp.get("days_inactive", 0)
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
