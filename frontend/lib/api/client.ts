// ===========================================
// Radar Comercial — API Client
// Correções aplicadas:
//  1. Token removido de localStorage → httpOnly cookie via credentials: 'include'
//  2. Redirect 401 não usa mais window.location — lança erro para o contexto tratar
//  3. AbortError propagado corretamente (não engolido no catch genérico)
//  4. Tipagem forte — sem 'any' nas assinaturas públicas
// ===========================================

import type {
  ApiResponse,
  User,
  Company,
  UploadedFile,
  InsightsData,
  TeamMember,
  LoginCredentials,
  SignupData,
  CustomerDetail,
  ApiKey,
  NewApiKey,
  NotificationPreference,
  CarteiraOpportunity,
  RankingEntry,
  OpportunityStatus,
  GenerateMessageResponse,
  SyncConfig,
  OutreachConfig,
  OutreachContact,
  RecoverySummary,
  ChurnRiskData,
  GerencialData,
  SalesTarget,
  ScheduledReport,
  InboxEntry,
  WebhookConfig,
  WebhookDelivery,
  MessageTemplate,
  Campaign,
  AuditEntry,
  ForecastData,
  MfaStatus,
  MfaSetup,
  UserSessionEntry,
  SSOConnection,
  SSOConnectionsResult,
  SSODiscovery,
  ScimTokenResult,
  RolesData,
  CustomRole,
  OrgUnit,
} from '@/types'

/** Resposta de login: ou autentica direto, ou exige 2º fator (MFA). */
export type LoginResult =
  | { user: User; company: Company; requiresPasswordChange?: boolean }
  | { mfaRequired: true; mfaToken: string }

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

// --------------- Erro tipado para 401 ---------------

export class UnauthorizedError extends Error {
  constructor() {
    super('Sessão expirada. Faça login novamente.')
    this.name = 'UnauthorizedError'
  }
}

// --------------- Wrapper base ---------------
// Usa credentials: 'include' para enviar o httpOnly cookie automaticamente.
// Nunca armazena ou lê token do localStorage.

async function fetchWithAuth<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include', // envia httpOnly cookie automaticamente
    })

    // 401 → lança erro tipado; o AuthContext trata o redirecionamento via router
    if (response.status === 401) {
      throw new UnauthorizedError()
    }

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.detail ?? data.message ?? data.error ?? 'Erro na requisição',
      }
    }

    // Backend já retorna { success, data } ou retorna o payload direto
    if (data && typeof data.success !== 'undefined') {
      return data as ApiResponse<T>
    }

    return { success: true, data }
  } catch (error) {
    // AbortError é re-lançado para o hook tratar sem setar estado
    if (error instanceof Error && error.name === 'AbortError') throw error
    // UnauthorizedError é re-lançado para o AuthContext tratar
    if (error instanceof UnauthorizedError) throw error

    console.error('API Error:', error)
    return {
      success: false,
      error: 'Erro de conexão. Verifique o servidor backend.',
    }
  }
}

// --------------- Auth ---------------

export const authApi = {
  async login(
    credentials: LoginCredentials
  ): Promise<ApiResponse<LoginResult>> {
    // O backend seta o cookie httpOnly na resposta — sem token no body.
    // Se a conta tiver MFA, retorna { mfaRequired, mfaToken } sem setar cookie.
    return fetchWithAuth('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    })
  },

  async verifyMfa(
    mfaToken: string,
    code: string
  ): Promise<ApiResponse<{ user: User; company: Company; requiresPasswordChange?: boolean }>> {
    return fetchWithAuth('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ mfa_token: mfaToken, code }),
    })
  },

  async listSessions(): Promise<ApiResponse<UserSessionEntry[]>> {
    return fetchWithAuth('/auth/sessions')
  },

  async revokeSession(sessionId: string): Promise<ApiResponse<void>> {
    return fetchWithAuth(`/auth/sessions/${sessionId}`, { method: 'DELETE' })
  },

  async revokeOtherSessions(): Promise<ApiResponse<{ revoked: number }>> {
    return fetchWithAuth('/auth/sessions', { method: 'DELETE' })
  },

  async signup(
    data: SignupData
  ): Promise<ApiResponse<{ user: User; company: Company }>> {
    return fetchWithAuth('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async logout(): Promise<void> {
    // Backend limpa o cookie httpOnly no servidor
    await fetchWithAuth('/auth/logout', { method: 'POST' }).catch(() => null)
  },

  async getCurrentUser(): Promise<ApiResponse<{ user: User; company: Company }>> {
    return fetchWithAuth('/auth/me')
  },

  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<ApiResponse<void>> {
    return fetchWithAuth('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    })
  },

  async forgotPassword(email: string): Promise<ApiResponse<void>> {
    return fetchWithAuth('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  },

  async resetPassword(token: string, newPassword: string): Promise<ApiResponse<void>> {
    return fetchWithAuth('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    })
  },

  async setPassword(newPassword: string): Promise<ApiResponse<void>> {
    return fetchWithAuth('/auth/set-password', {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword }),
    })
  },
}

// --------------- Files / Upload ---------------

/** Metadados de paginação devolvidos por GET /files/ (offset-based). */
export interface FilesListMeta {
  total: number
  limit: number
  offset: number
}

export const filesApi = {
  /** Upload com progresso real via XHR. Usa cookie automaticamente. */
  async upload(
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<UploadedFile>> {
    const formData = new FormData()
    formData.append('file', file)

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100))
        }
      })

      xhr.addEventListener('load', () => {
        try {
          const data = JSON.parse(xhr.responseText)
          if (xhr.status >= 200 && xhr.status < 300) {
            // Backend returns { success, data } — don't double-wrap
            resolve(typeof data?.success !== 'undefined' ? data : { success: true, data })
          } else if (xhr.status === 401) {
            resolve({ success: false, error: 'Sessão expirada. Faça login novamente.' })
          } else {
            resolve({ success: false, error: data.detail ?? data.message ?? 'Erro no upload' })
          }
        } catch {
          resolve({ success: false, error: 'Erro ao processar resposta' })
        }
      })

      xhr.addEventListener('error', () =>
        resolve({ success: false, error: 'Erro de conexão' })
      )

      xhr.open('POST', `${API_BASE_URL}/files/upload`)
      xhr.withCredentials = true // envia cookie httpOnly
      xhr.send(formData)
    })
  },

  async getStatus(fileId: string): Promise<ApiResponse<UploadedFile>> {
    return fetchWithAuth(`/files/${fileId}/status`)
  },

  async list(
    params?: { limit?: number; offset?: number }
  ): Promise<ApiResponse<UploadedFile[]> & { pagination?: FilesListMeta }> {
    // Backend filtra por company_id via cookie/JWT. limit/offset são opcionais
    // (default backend: limit=200, offset=0); a meta vem em `pagination`.
    const qs = new URLSearchParams()
    if (params?.limit !== undefined) qs.set('limit', String(params.limit))
    if (params?.offset !== undefined) qs.set('offset', String(params.offset))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return fetchWithAuth<UploadedFile[]>(`/files/${suffix}`)
  },

  async delete(fileId: string): Promise<ApiResponse<void>> {
    return fetchWithAuth(`/files/${fileId}`, { method: 'DELETE' })
  },
}

// --------------- Insights ---------------

export const insightsApi = {
  async get(
    companyId: string,
    filters?: { dateRange?: string },
    options?: Pick<RequestInit, 'signal'>
  ): Promise<ApiResponse<InsightsData>> {
    const params = new URLSearchParams()
    if (filters?.dateRange) params.append('date_range', filters.dateRange)
    const query = params.toString() ? `?${params.toString()}` : ''
    return fetchWithAuth(`/insights/${companyId}${query}`, options)
  },

  // Churn preditivo — clientes prestes a sumir (ação proativa)
  async getChurnRisk(companyId: string): Promise<ApiResponse<ChurnRiskData>> {
    return fetchWithAuth(`/insights/${companyId}/churn-risk`)
  },

  // Previsão de receita para os próximos 3 meses
  async getForecast(companyId: string, dateRange: string = '6m'): Promise<ApiResponse<ForecastData>> {
    return fetchWithAuth(`/insights/${companyId}/forecast?date_range=${encodeURIComponent(dateRange)}`)
  },

  // Baixa o relatório de insights em PDF (gerado no backend). Retorna o Blob
  // direto — não passa pelo fetchWithAuth porque a resposta é binária, não JSON.
  async downloadReport(companyId: string, dateRange: string): Promise<Blob> {
    const response = await fetch(
      `${API_BASE_URL}/insights/${companyId}/report?date_range=${encodeURIComponent(dateRange)}`,
      { credentials: 'include' }
    )
    if (response.status === 401) throw new UnauthorizedError()
    if (!response.ok) throw new Error('Falha ao gerar o relatório PDF.')
    return response.blob()
  },
}

// --------------- Customers ---------------

export const customersApi = {
  async getById(
    companyId: string,
    customerId: string,
    options?: Pick<RequestInit, 'signal'>
  ): Promise<ApiResponse<CustomerDetail>> {
    return fetchWithAuth(`/customers/${companyId}/${customerId}`, options)
  },
}

// --------------- Team ---------------

export const teamApi = {
  async list(companyId: string): Promise<ApiResponse<TeamMember[]>> {
    return fetchWithAuth(`/team/${companyId}`)
  },

  async invite(
    companyId: string,
    email: string,
    role: TeamMember['role'],
    scope?: string | null,
    extra?: { roleId?: string | null; orgUnitId?: string | null }
  ): Promise<ApiResponse<TeamMember>> {
    return fetchWithAuth(`/team/${companyId}/invite`, {
      method: 'POST',
      body: JSON.stringify({
        email, role, scope: scope ?? null,
        role_id: extra?.roleId ?? null,
        org_unit_id: extra?.orgUnitId ?? null,
      }),
    })
  },

  async updateRole(
    memberId: string,
    role: TeamMember['role'],
    scope?: string | null,
    extra?: { roleId?: string | null; orgUnitId?: string | null }
  ): Promise<ApiResponse<TeamMember>> {
    return fetchWithAuth(`/team/members/${memberId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({
        role,
        ...(scope !== undefined ? { scope } : {}),
        ...(extra?.roleId !== undefined ? { role_id: extra.roleId } : {}),
        ...(extra?.orgUnitId !== undefined ? { org_unit_id: extra.orgUnitId } : {}),
      }),
    })
  },

  async remove(memberId: string): Promise<ApiResponse<void>> {
    return fetchWithAuth(`/team/members/${memberId}`, { method: 'DELETE' })
  },

  async resendInvite(memberId: string): Promise<ApiResponse<void>> {
    return fetchWithAuth(`/team/members/${memberId}/resend-invite`, { method: 'POST' })
  },
}

// --------------- Company ---------------

export const companyApi = {
  async update(companyId: string, data: Partial<Company>): Promise<ApiResponse<Company>> {
    return fetchWithAuth(`/company/${companyId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },
}

// --------------- User ---------------

export const userApi = {
  async update(userId: string, data: Partial<User>): Promise<ApiResponse<User>> {
    return fetchWithAuth(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },
}

// --------------- Billing ---------------

export const billingApi = {
  async createCheckoutSession(
    plan: 'pro' | 'enterprise'
  ): Promise<ApiResponse<{ url: string }>> {
    return fetchWithAuth('/billing/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    })
  },

  async syncPlan(): Promise<ApiResponse<{ plan: string; uploadsLimit: number }>> {
    return fetchWithAuth('/billing/debug-sync-plan', { method: 'POST' })
  },
}

// --------------- Integrations / API Keys ---------------

export const integrationsApi = {
  async listKeys(): Promise<ApiResponse<ApiKey[]>> {
    return fetchWithAuth('/integrations/keys')
  },

  async createKey(name: string): Promise<ApiResponse<NewApiKey>> {
    return fetchWithAuth('/integrations/keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  },

  async revokeKey(keyId: string): Promise<ApiResponse<void>> {
    return fetchWithAuth(`/integrations/keys/${keyId}`, { method: 'DELETE' })
  },

  async getSyncStatus(): Promise<ApiResponse<SyncConfig | null>> {
    return fetchWithAuth('/integrations/sync/status')
  },

  async saveSyncConfig(data: { sheetUrl: string; sheetName?: string; enabled: boolean }): Promise<ApiResponse<{ id: string }>> {
    return fetchWithAuth('/integrations/sync/config', {
      method: 'POST',
      body: JSON.stringify({ sheet_url: data.sheetUrl, sheet_name: data.sheetName || null, enabled: data.enabled }),
    })
  },

  async triggerSync(): Promise<ApiResponse<void>> {
    return fetchWithAuth('/integrations/sync/trigger', { method: 'POST' })
  },
}

// --------------- Notifications ---------------

export const notificationsApi = {
  async getPreferences(): Promise<ApiResponse<NotificationPreference>> {
    return fetchWithAuth('/notifications/preferences')
  },

  async updatePreferences(
    data: Partial<NotificationPreference>
  ): Promise<ApiResponse<void>> {
    return fetchWithAuth('/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async testSend(): Promise<ApiResponse<{ email?: boolean; whatsapp?: boolean }>> {
    return fetchWithAuth('/notifications/test-send', { method: 'POST' })
  },
}

// --------------- Carteira Ativa ---------------

export const carteiraApi = {
  async list(
    companyId: string,
    status?: OpportunityStatus,
    branch?: string,
    salesperson?: string
  ): Promise<ApiResponse<CarteiraOpportunity[]>> {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (branch) params.set('branch', branch)
    if (salesperson) params.set('salesperson', salesperson)
    const q = params.size ? `?${params.toString()}` : ''
    return fetchWithAuth(`/carteira/${companyId}${q}`)
  },

  async upsertAction(
    companyId: string,
    payload: {
      opportunity_id: string
      customer_name: string
      expected_value: number
      status: OpportunityStatus
      notes?: string | null
      channel?: string | null
    }
  ): Promise<ApiResponse<void>> {
    return fetchWithAuth(`/carteira/${companyId}/actions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async getRanking(companyId: string): Promise<ApiResponse<RankingEntry[]>> {
    return fetchWithAuth(`/carteira/${companyId}/ranking`)
  },

  async getGerencial(companyId: string): Promise<ApiResponse<GerencialData>> {
    return fetchWithAuth(`/carteira/${companyId}/gerencial`)
  },

  async listTargets(companyId: string, period?: string): Promise<ApiResponse<SalesTarget[]>> {
    const q = period ? `?period=${period}` : ''
    return fetchWithAuth(`/carteira/${companyId}/targets${q}`)
  },

  async upsertTarget(
    companyId: string,
    data: { keyType: string; keyValue?: string | null; period: string; targetWon?: number | null; targetValue?: number | null }
  ): Promise<ApiResponse<void>> {
    return fetchWithAuth(`/carteira/${companyId}/targets`, {
      method: 'POST',
      body: JSON.stringify({
        key_type: data.keyType,
        key_value: data.keyValue ?? null,
        period: data.period,
        target_won: data.targetWon ?? null,
        target_value: data.targetValue ?? null,
      }),
    })
  },

  async deleteTarget(companyId: string, targetId: string): Promise<ApiResponse<void>> {
    return fetchWithAuth(`/carteira/${companyId}/targets/${targetId}`, { method: 'DELETE' })
  },
}

// --------------- Opportunities ---------------

export const opportunitiesApi = {
  async generateMessage(
    opportunityId: string,
    customerHash: string,
    dateRange: string = '1m'
  ): Promise<ApiResponse<GenerateMessageResponse>> {
    return fetchWithAuth(`/opportunities/${opportunityId}/generate-message`, {
      method: 'POST',
      body: JSON.stringify({ customer_hash: customerHash, date_range: dateRange }),
    })
  },
}

// --------------- Outreach (disparo ao cliente final) ---------------

export const outreachApi = {
  async getConfig(): Promise<ApiResponse<OutreachConfig>> {
    return fetchWithAuth('/outreach/config')
  },
  async updateConfig(data: Partial<OutreachConfig>): Promise<ApiResponse<OutreachConfig>> {
    // converte camelCase do front → snake_case esperado pelo backend
    const body: Record<string, unknown> = {}
    if (data.autoSendEnabled !== undefined) body.auto_send_enabled = data.autoSendEnabled
    if (data.whatsappEnabled !== undefined) body.whatsapp_enabled = data.whatsappEnabled
    if (data.emailEnabled !== undefined) body.email_enabled = data.emailEnabled
    if (data.senderName !== undefined) body.sender_name = data.senderName
    if (data.replyToEmail !== undefined) body.reply_to_email = data.replyToEmail
    if (data.sendHour !== undefined) body.send_hour = data.sendHour
    if (data.minOpportunityValue !== undefined) body.min_opportunity_value = data.minOpportunityValue
    if (data.dailyLimit !== undefined) body.daily_limit = data.dailyLimit
    if (data.cadenceEnabled !== undefined) body.cadence_enabled = data.cadenceEnabled
    return fetchWithAuth('/outreach/config', { method: 'PATCH', body: JSON.stringify(body) })
  },
  async connectWhatsapp(): Promise<ApiResponse<{ qrcode: string | null }>> {
    return fetchWithAuth('/outreach/whatsapp/connect', { method: 'POST' })
  },
  async whatsappStatus(): Promise<ApiResponse<{ status: string; whatsappNumber?: string | null }>> {
    return fetchWithAuth('/outreach/whatsapp/status')
  },
  async disconnectWhatsapp(): Promise<ApiResponse<OutreachConfig>> {
    return fetchWithAuth('/outreach/whatsapp/disconnect', { method: 'POST' })
  },
  async listContacts(): Promise<ApiResponse<OutreachContact[]>> {
    return fetchWithAuth('/outreach/contacts')
  },
  async updateContact(
    customerHash: string,
    data: { phone?: string | null; email?: string | null; contact_opt_out?: boolean }
  ): Promise<ApiResponse<{ customerHash: string }>> {
    return fetchWithAuth(`/outreach/contacts/${customerHash}`, {
      method: 'PATCH', body: JSON.stringify(data),
    })
  },
  async previewMessage(): Promise<ApiResponse<{ message: string | null; customerName: string | null; aiEnabled?: boolean; reason?: string }>> {
    return fetchWithAuth('/outreach/preview')
  },
  async sendNow(): Promise<ApiResponse<{ queued: boolean; message: string }>> {
    return fetchWithAuth('/outreach/send-now', { method: 'POST' })
  },
  async getRecovery(): Promise<ApiResponse<RecoverySummary>> {
    return fetchWithAuth('/outreach/recovery')
  },
  async getInbox(params?: { limit?: number; offset?: number }): Promise<ApiResponse<InboxEntry[]>> {
    const p = new URLSearchParams()
    if (params?.limit) p.set('limit', String(params.limit))
    if (params?.offset) p.set('offset', String(params.offset))
    const q = p.size ? `?${p.toString()}` : ''
    return fetchWithAuth(`/outreach/inbox${q}`)
  },
}

// --------------- Reports ---------------

export const reportsApi = {
  excelUrl(
    companyId: string,
    params?: { dateRange?: string; branch?: string; salesperson?: string }
  ): string {
    const p = new URLSearchParams()
    if (params?.dateRange) p.set('date_range', params.dateRange)
    if (params?.branch) p.set('branch', params.branch)
    if (params?.salesperson) p.set('salesperson', params.salesperson)
    const q = p.size ? `?${p.toString()}` : ''
    return `${API_BASE_URL}/reports/${companyId}/excel${q}`
  },

  async listSchedules(companyId: string): Promise<ApiResponse<ScheduledReport[]>> {
    return fetchWithAuth(`/reports/${companyId}/schedules`)
  },

  async createSchedule(
    companyId: string,
    data: { frequency: string; dayOfWeek?: number | null; recipients: string[]; dateRange?: string }
  ): Promise<ApiResponse<ScheduledReport>> {
    return fetchWithAuth(`/reports/${companyId}/schedules`, {
      method: 'POST',
      body: JSON.stringify({
        frequency: data.frequency,
        day_of_week: data.dayOfWeek ?? null,
        recipients: data.recipients,
        date_range: data.dateRange ?? '1m',
      }),
    })
  },

  async deleteSchedule(companyId: string, scheduleId: string): Promise<ApiResponse<void>> {
    return fetchWithAuth(`/reports/${companyId}/schedules/${scheduleId}`, { method: 'DELETE' })
  },
}

// --------------- Webhooks ---------------

export const webhooksApi = {
  async list(): Promise<ApiResponse<WebhookConfig[]>> {
    return fetchWithAuth('/integrations/webhooks')
  },

  async create(data: { targetUrl: string; events: string[] }): Promise<ApiResponse<WebhookConfig & { secret: string }>> {
    return fetchWithAuth('/integrations/webhooks', {
      method: 'POST',
      body: JSON.stringify({ target_url: data.targetUrl, events: data.events }),
    })
  },

  async remove(webhookId: string): Promise<ApiResponse<void>> {
    return fetchWithAuth(`/integrations/webhooks/${webhookId}`, { method: 'DELETE' })
  },

  async test(webhookId: string): Promise<ApiResponse<void>> {
    return fetchWithAuth(`/integrations/webhooks/${webhookId}/test`, { method: 'POST' })
  },

  async listDeliveries(): Promise<ApiResponse<WebhookDelivery[]>> {
    return fetchWithAuth('/integrations/webhooks/deliveries')
  },
}

// --------------- Templates de Mensagem ---------------

export const templatesApi = {
  async list(): Promise<ApiResponse<MessageTemplate[]>> {
    return fetchWithAuth('/outreach/templates')
  },
  async create(data: { name: string; segment: string; content: string; isActive?: boolean }): Promise<ApiResponse<MessageTemplate>> {
    return fetchWithAuth('/outreach/templates', {
      method: 'POST',
      body: JSON.stringify({ name: data.name, segment: data.segment, content: data.content, is_active: data.isActive ?? true }),
    })
  },
  async update(id: string, data: { name: string; segment: string; content: string; isActive?: boolean }): Promise<ApiResponse<MessageTemplate>> {
    return fetchWithAuth(`/outreach/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: data.name, segment: data.segment, content: data.content, is_active: data.isActive ?? true }),
    })
  },
  async remove(id: string): Promise<ApiResponse<void>> {
    return fetchWithAuth(`/outreach/templates/${id}`, { method: 'DELETE' })
  },
}

// --------------- Campanhas ---------------

export const campaignsApi = {
  async list(companyId: string, params?: { limit?: number; offset?: number }): Promise<ApiResponse<Campaign[]>> {
    const p = new URLSearchParams()
    if (params?.limit) p.set('limit', String(params.limit))
    if (params?.offset) p.set('offset', String(params.offset))
    const q = p.size ? `?${p.toString()}` : ''
    return fetchWithAuth(`/campaigns/${companyId}${q}`)
  },
  async create(
    companyId: string,
    data: { name: string; segment?: string | null; branch?: string | null; salesperson?: string | null; messageContent: string }
  ): Promise<ApiResponse<Campaign>> {
    return fetchWithAuth(`/campaigns/${companyId}`, {
      method: 'POST',
      body: JSON.stringify({
        name: data.name,
        segment: data.segment ?? null,
        branch: data.branch ?? null,
        salesperson: data.salesperson ?? null,
        message_content: data.messageContent,
      }),
    })
  },
  async send(companyId: string, campaignId: string): Promise<ApiResponse<{ queued: boolean; message: string }>> {
    return fetchWithAuth(`/campaigns/${companyId}/${campaignId}/send`, { method: 'POST' })
  },
  async remove(companyId: string, campaignId: string): Promise<ApiResponse<void>> {
    return fetchWithAuth(`/campaigns/${companyId}/${campaignId}`, { method: 'DELETE' })
  },
}

// --------------- RBAC: Papéis & Permissões ---------------

export const rolesApi = {
  async list(): Promise<ApiResponse<RolesData>> {
    return fetchWithAuth('/roles')
  },
  async create(data: { name: string; baseRole: string; permissions: string[] }): Promise<ApiResponse<CustomRole>> {
    return fetchWithAuth('/roles', { method: 'POST', body: JSON.stringify({ name: data.name, base_role: data.baseRole, permissions: data.permissions }) })
  },
  async update(id: string, data: { name: string; baseRole: string; permissions: string[] }): Promise<ApiResponse<CustomRole>> {
    return fetchWithAuth(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify({ name: data.name, base_role: data.baseRole, permissions: data.permissions }) })
  },
  async remove(id: string): Promise<ApiResponse<void>> {
    return fetchWithAuth(`/roles/${id}`, { method: 'DELETE' })
  },
}

// --------------- Estrutura organizacional ---------------

export const orgUnitsApi = {
  async list(): Promise<ApiResponse<OrgUnit[]>> {
    return fetchWithAuth('/org-units')
  },
  async create(data: { name: string; type: string; parentId?: string | null }): Promise<ApiResponse<OrgUnit>> {
    return fetchWithAuth('/org-units', { method: 'POST', body: JSON.stringify({ name: data.name, type: data.type, parent_id: data.parentId ?? null }) })
  },
  async update(id: string, data: { name: string; type: string; parentId?: string | null }): Promise<ApiResponse<OrgUnit>> {
    return fetchWithAuth(`/org-units/${id}`, { method: 'PATCH', body: JSON.stringify({ name: data.name, type: data.type, parent_id: data.parentId ?? null }) })
  },
  async remove(id: string): Promise<ApiResponse<void>> {
    return fetchWithAuth(`/org-units/${id}`, { method: 'DELETE' })
  },
}

// --------------- MFA (2FA) ---------------

export const mfaApi = {
  async status(): Promise<ApiResponse<MfaStatus>> {
    return fetchWithAuth('/mfa/status')
  },
  async setup(): Promise<ApiResponse<MfaSetup>> {
    return fetchWithAuth('/mfa/setup', { method: 'POST' })
  },
  async enable(code: string): Promise<ApiResponse<{ backupCodes: string[] }>> {
    return fetchWithAuth('/mfa/enable', { method: 'POST', body: JSON.stringify({ code }) })
  },
  async disable(password: string): Promise<ApiResponse<void>> {
    return fetchWithAuth('/mfa/disable', { method: 'POST', body: JSON.stringify({ password }) })
  },
  async regenerateBackupCodes(): Promise<ApiResponse<{ backupCodes: string[] }>> {
    return fetchWithAuth('/mfa/backup-codes/regenerate', { method: 'POST' })
  },
}

// --------------- SSO & SCIM ---------------

export interface SSOConnectionInput {
  protocol: 'oidc' | 'saml'
  displayName?: string
  defaultRole?: string
  allowedDomains: string[]
  issuer?: string
  clientId?: string
  clientSecret?: string
  idpMetadata?: string
}

export const ssoApi = {
  async listConnections(): Promise<ApiResponse<SSOConnectionsResult>> {
    return fetchWithAuth('/sso/connections')
  },
  async createConnection(data: SSOConnectionInput): Promise<ApiResponse<SSOConnection>> {
    return fetchWithAuth('/sso/connections', {
      method: 'POST',
      body: JSON.stringify({
        protocol: data.protocol,
        display_name: data.displayName ?? null,
        default_role: data.defaultRole ?? 'viewer',
        allowed_domains: data.allowedDomains,
        issuer: data.issuer ?? null,
        client_id: data.clientId ?? null,
        client_secret: data.clientSecret ?? null,
        idp_metadata: data.idpMetadata ?? null,
      }),
    })
  },
  async deleteConnection(id: string): Promise<ApiResponse<void>> {
    return fetchWithAuth(`/sso/connections/${id}`, { method: 'DELETE' })
  },
  async createScimToken(): Promise<ApiResponse<ScimTokenResult>> {
    return fetchWithAuth('/sso/scim-token', { method: 'POST' })
  },
  async discover(email: string): Promise<ApiResponse<SSODiscovery>> {
    return fetchWithAuth(`/sso/discover?email=${encodeURIComponent(email)}`)
  },
}

// --------------- Auditoria ---------------

export const auditApi = {
  async listLog(
    companyId: string,
    params?: { limit?: number; offset?: number; action?: string }
  ): Promise<ApiResponse<AuditEntry[]>> {
    const p = new URLSearchParams()
    if (params?.limit) p.set('limit', String(params.limit))
    if (params?.offset) p.set('offset', String(params.offset))
    if (params?.action) p.set('action', params.action)
    const q = p.size ? `?${p.toString()}` : ''
    return fetchWithAuth(`/audit/${companyId}/log${q}`)
  },
}

// --------------- Export agregado ---------------

export const api = {
  auth: authApi,
  files: filesApi,
  insights: insightsApi,
  customers: customersApi,
  team: teamApi,
  company: companyApi,
  user: userApi,
  billing: billingApi,
  integrations: integrationsApi,
  notifications: notificationsApi,
  carteira: carteiraApi,
  opportunities: opportunitiesApi,
  outreach: outreachApi,
  reports: reportsApi,
  webhooks: webhooksApi,
  templates: templatesApi,
  campaigns: campaignsApi,
  audit: auditApi,
  mfa: mfaApi,
  sso: ssoApi,
  roles: rolesApi,
  orgUnits: orgUnitsApi,
}


export default api
