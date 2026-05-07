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
} from '@/types'

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
  ): Promise<ApiResponse<{ user: User; company: Company }>> {
    // O backend seta o cookie httpOnly na resposta — sem token no body
    return fetchWithAuth('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    })
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
}

// --------------- Files / Upload ---------------

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

  async list(): Promise<ApiResponse<UploadedFile[]>> {
    // Backend filtra por company_id via cookie/JWT — não precisa do query string
    return fetchWithAuth('/files/')
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
    role: TeamMember['role']
  ): Promise<ApiResponse<TeamMember>> {
    return fetchWithAuth(`/team/${companyId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    })
  },

  async updateRole(
    memberId: string,
    role: TeamMember['role']
  ): Promise<ApiResponse<TeamMember>> {
    return fetchWithAuth(`/team/members/${memberId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
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
    status?: OpportunityStatus
  ): Promise<ApiResponse<CarteiraOpportunity[]>> {
    const q = status ? `?status=${status}` : ''
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
}

export default api
