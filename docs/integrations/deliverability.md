# Checklist de entregabilidade (e-mail + WhatsApp)

Operacional, não código. O backend já degrada graciosamente sem estas configs —
mas sem elas as mensagens **não chegam** (ou caem em spam / ficam restritas).

## E-mail (Resend)
- [ ] Domínio verificado no Resend (SPF + DKIM no DNS). Sandbox só envia de
      `onboarding@resend.dev` para `delivered@resend.dev`.
- [ ] `RESEND_FROM_EMAIL` = `Radar Comercial <noreply@seudominio.com>` (domínio verificado).
- [ ] DMARC publicado (`_dmarc.seudominio.com`) — reduz spam.
- [ ] Remetente consistente (mesmo from sempre) p/ reputação.

## WhatsApp ao vendedor (Cloud API — Meta)
- [ ] App criado no Meta for Developers + número conectado.
- [ ] `WHATSAPP_API_TOKEN` (token do app) e `WHATSAPP_PHONE_NUMBER_ID` setados.
- [ ] **Verificação de negócio na Meta** — sem ela, há restrição de país/volume no sandbox.
- [ ] Templates aprovados (mensagens fora da janela de 24h exigem template).

## WhatsApp ao cliente final (Evolution API — número do vendedor)
- [ ] Container Evolution no ar (`docker-compose.evolution.yml`); `EVOLUTION_API_URL` + `EVOLUTION_API_KEY`.
- [ ] Instância conectada via QR (`/dashboard/disparo`); sessão persiste no volume.
- [ ] Anti-ban: opt-out ativo, intervalo aleatório entre envios, volume baixo, msg personalizada (já no código).
- [ ] Aquecer o número (volume crescente) antes de disparos maiores.

## IA (mensagens)
- [ ] `ANTHROPIC_API_KEY` setada (senão usa fallback estático).

> Sem qualquer uma destas, o recurso correspondente simplesmente não dispara —
> o app continua funcionando. Confirme `APP_BASE_URL` p/ os links nos e-mails.
