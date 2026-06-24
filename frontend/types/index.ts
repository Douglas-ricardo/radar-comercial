// ===========================================
// Radar Comercial — Tipos unificados
// Fonte única de verdade para todos os tipos do projeto.
// ===========================================

// --------------- Auth ---------------

export interface User {
    id: string
    email: string
    name: string
    role: 'admin' | 'analyst' | 'viewer'
    /** Escopo territorial: "branch:SP-001" ou null (sem restrição). */
    scope?: string | null
    status?: 'pending' | 'active'
    companyId: string
    createdAt: string
    updatedAt: string
  }
  
  export interface Company {
    id: string
    name: string
    cnpj?: string
    plan: 'free' | 'pro' | 'enterprise'
    uploadsLimit: number
    uploadsUsed: number
    /** Ciclo de compra médio em dias (afeta scores de churn). Default: 90. */
    purchaseCycleDays?: number
    /** CIDRs permitidos para login (enterprise). Vazio = sem restrição. */
    ipAllowlist?: string[]
    /** Retenção de logs de auditoria em dias (default 365). */
    auditRetentionDays?: number
    /** Moeda de exibição ISO 4217 (default BRL). */
    currency?: string
    /** Tenant sandbox (dados demo). */
    isSandbox?: boolean
    ownerId: string
    createdAt: string
    updatedAt: string
  }

  // --------------- Uso & Quotas ---------------

  export interface UsageKind {
    last30: number
    today: number
    quota: number | null
  }

  export interface UsageData {
    byKind: Record<string, UsageKind>
    daily: Array<Record<string, string | number>>
    plan: string
  }

  // --------------- Status / SLA ---------------

  export interface ServiceStatus {
    status: 'operational' | 'degraded' | 'down'
    latencyMs?: number
    workers?: number
    error?: string
    note?: string
  }

  export interface StatusData {
    overall: 'operational' | 'degraded' | 'outage'
    services: Record<string, ServiceStatus>
  }
  
  export interface AuthState {
    user: User | null
    company: Company | null
    isAuthenticated: boolean
    isLoading: boolean
  }
  
  export interface LoginCredentials {
    email: string
    password: string
  }
  
  export interface SignupData {
    name: string
    email: string
    password: string
    companyName: string
    cnpj?: string
  }
  
  export interface OnboardingData {
    companyName: string
    cnpj?: string
    industry?: string
    employeeCount?: string
    plan: 'free' | 'pro' | 'enterprise'
  }
  
  // --------------- Arquivos & Upload ---------------
  
  export interface UploadedFile {
    id: string
    companyId: string
    filename: string
    fileSize: number
    uploadedBy: string
    uploadedAt: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
    periodStart?: string
    periodEnd?: string
    errorMessage?: string
    // Campos calculados retornados pelo backend após análise
    lostRevenue?: number
    totalRevenue?: number
    opportunities?: number
  }
  
  // --------------- Insights & Análise ---------------
  
  export interface InsightsSummary {
    totalRevenue: number
    lostRevenue: number
    lostRate: number
    revenueGrowth: number
    uniqueCustomers: number
    uniqueProducts: number
    /** "live" se o dado é recente (≤7d); senão "até DD/MM/YYYY" do arquivo. */
    dataFreshness?: string
  }
  
  /** Oportunidade comercial identificada — tipo único e definitivo. */
  export interface Opportunity {
    id: string
    customer: string
    product: string | null
    type: 'missing_sale' | 'declining_customer' | 'seasonal_gap' | 'product_gap'
    lastPurchase: string | null
    frequency: string | null
    expectedValue: number
    confidence: 'high' | 'medium' | 'low'
    description?: string
    /** Filial/unidade extraída do CSV (opcional). */
    branch?: string | null
    /** Vendedor responsável extraído do CSV (opcional). */
    salesperson?: string | null
  }
  
  export interface CustomerRow {
    id: string
    name: string
    value: number
    percentage: number
    trend: 'up' | 'down' | 'stable'
  }
  
  export interface TimeSeriesPoint {
    month: string
    receita: number
    perdida: number
    meta?: number
  }
  
  export interface ProductGapPoint {
    produto: string
    gap: number
  }
  
  export interface SeasonalityPoint {
    month: string
    atual: number
    media: number
    variacao: number
  }
  
  export interface InsightsData {
    summary: InsightsSummary
    opportunities: Opportunity[]
    charts: {
      timeSeries: TimeSeriesPoint[]
      customerDistribution: CustomerRow[]
      productGaps: ProductGapPoint[]
      seasonality: SeasonalityPoint[]
    }
  }
  
  // --------------- Cliente (RFV) ---------------

  export interface CustomerTopProduct {
    product: string
    totalValue: number
    totalQuantity: number
    percentage: number
  }
  
  export interface CustomerRevenuePoint {
    month: string
    value: number
  }
  
  export interface CustomerRFV {
    recency: number
    frequency: number
    value: number
    recencyScore: 1 | 2 | 3 | 4 | 5
    frequencyScore: 1 | 2 | 3 | 4 | 5
    valueScore: 1 | 2 | 3 | 4 | 5
    segment: 'champion' | 'loyal' | 'at_risk' | 'lost' | 'new'
  }
  
  export interface CustomerAlert {
    id: string
    type: Opportunity['type']
    description: string
    expectedValue: number
    confidence: Opportunity['confidence']
  }
  
  export interface CustomerDetail {
    id: string
    name: string
    /** CNPJ/CPF sem formatação, extraído do CSV (opcional). */
    document: string | null
    branch?: string | null
    salesperson?: string | null
    totalRevenue: number
    percentage: number
    trend: 'up' | 'down' | 'stable'
    rfv: CustomerRFV
    topProducts: CustomerTopProduct[]
    revenueHistory: CustomerRevenuePoint[]
    alerts: CustomerAlert[]
  }
  
  // --------------- Time ---------------
  
  export interface TeamMember {
    id: string
    email: string
    name: string
    role: 'admin' | 'analyst' | 'viewer'
    scope?: string | null
    roleId?: string | null
    orgUnitId?: string | null
    status: 'pending' | 'active'
    createdAt?: string | null
  }

  // --------------- RBAC: Papéis & Permissões ---------------

  export interface PermissionCatalogEntry {
    key: string
    group: string
    label: string
  }

  export interface CustomRole {
    id: string
    name: string
    baseRole: 'admin' | 'analyst' | 'viewer'
    permissions: string[]
    isSystem: boolean
    createdAt: string | null
  }

  export interface RolesData {
    catalog: PermissionCatalogEntry[]
    presets: Record<string, string[]>
    roles: CustomRole[]
  }

  // --------------- Estrutura organizacional ---------------

  export interface OrgUnit {
    id: string
    name: string
    type: 'region' | 'branch' | 'team'
    parentId: string | null
    createdAt: string | null
  }

  // --------------- CRM (sync bidirecional) ---------------

  export interface CrmConnection {
    id: string
    provider: 'hubspot' | 'salesforce' | 'pipedrive'
    enabled: boolean
    pushEnabled: boolean
    fieldMap: Record<string, string>
    lastSyncAt: string | null
    lastSyncStatus: 'ok' | 'error' | null
    lastSyncError: string | null
    createdAt: string | null
  }

  // --------------- Saved views ---------------

  export interface SavedView {
    id: string
    name: string
    page: 'carteira' | 'insights' | 'dashboard'
    config: Record<string, unknown>
    createdAt: string | null
  }

  // --------------- Cohorts ---------------

  export interface CohortRow {
    cohort: string
    size: number
    retention: number[]
  }

  export interface CohortData {
    cohorts: CohortRow[]
    maxOffset: number
  }
  
  // --------------- API ---------------
  
  export interface ApiResponse<T> {
    success: boolean
    data?: T
    error?: string
    message?: string
  }
  
  export interface PaginatedResponse<T> {
    data: T[]
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
  
  export interface ApiKey {
    id: string
    name: string
    prefix: string
    createdAt: string
    lastUsedAt: string | null
  }

  export interface NewApiKey extends ApiKey {
    key: string  // plaintext — returned only on creation
  }

  export interface SyncConfig {
    id: string
    type: string
    sheetUrl: string | null
    sheetName: string | null
    enabled: boolean
    lastSyncAt: string | null
    lastSyncStatus: 'ok' | 'error' | null
    lastSyncError: string | null
  }

  export interface NotificationPreference {
    enabled: boolean
    emailEnabled: boolean
    whatsappEnabled: boolean
    whatsappPhone: string | null
    sendHour: number
    minOpportunityValue: number
  }

  export type OpportunityStatus = 'to_contact' | 'contacted' | 'won' | 'lost'

  export interface OpportunityAction {
    status: OpportunityStatus
    notes: string | null
    channel: string | null
    updatedAt: string | null
  }

  export interface CarteiraOpportunity extends Opportunity {
    customerHash: string
    daysInactive: number
    action: OpportunityAction
  }

  export interface GenerateMessageResponse {
    message: string
    cached: boolean
  }

  export interface RankingEntry {
    userId: string
    userName: string
    toContact: number
    contacted: number
    won: number
    lost: number
    totalWonValue: number
    conversionRate: number
  }
  
  export interface OutreachConfig {
    autoSendEnabled: boolean
    whatsappEnabled: boolean
    emailEnabled: boolean
    whatsappStatus: 'disconnected' | 'connecting' | 'connected'
    whatsappNumber: string | null
    senderName: string | null
    replyToEmail: string | null
    sendHour: number
    minOpportunityValue: number
    dailyLimit: number
    cadenceEnabled: boolean
    evolutionConfigured: boolean
  }

  export interface OutreachContact {
    customerHash: string
    customerName: string
    phone: string | null
    email: string | null
    optOut: boolean
    segment: string
    recencyDays: number
    totalRevenue: number
    sentRecently: boolean
  }

  export interface RecoverySummary {
    totalRecovered: number
    recoveredCount: number
    pendingCount: number
    repliesCount: number
    byChannel: Record<string, number>
    recent: {
      customerName: string | null
      value: number | null
      channel: string | null
      resolvedAt: string | null
    }[]
  }

  export interface ChurnRiskCustomer {
    customerHash: string
    customerName: string
    risk: 'low' | 'medium' | 'high'
    score: number
    recencyDays: number
    avgIntervalDays: number
    totalRevenue: number
    expectedValue: number
    phone: string | null
    email: string | null
  }

  export interface ChurnRiskData {
    customers: ChurnRiskCustomer[]
    counts: { high: number; medium: number; low: number }
    total: number
  }

  // --------------- Gerencial ---------------

  export interface GerencialRow {
    totalOpportunities: number
    totalValue: number
    toContact: number
    contacted: number
    won: number
    lost: number
    wonValue: number
    conversionRate: number
  }

  export interface GerencialBranchRow extends GerencialRow {
    branch: string
  }

  export interface GerencialSalespersonRow extends GerencialRow {
    salesperson: string
  }

  export interface GerencialData {
    by_branch: GerencialBranchRow[]
    by_salesperson: GerencialSalespersonRow[]
    totals: {
      totalOpportunities: number
      totalValue: number
      won: number
      wonValue: number
    }
  }

  // --------------- Metas Comerciais ---------------

  export interface SalesTarget {
    id: string
    keyType: 'branch' | 'salesperson' | 'company'
    keyValue: string | null
    period: 'month' | 'quarter' | 'year'
    targetWon: number | null
    targetValue: number | null
    createdAt: string
  }

  // --------------- Relatórios Agendados ---------------

  export interface ScheduledReport {
    id: string
    frequency: 'weekly' | 'monthly'
    dayOfWeek: number | null
    recipients: string[]
    dateRange: string
    enabled: boolean
    lastSentAt: string | null
    createdAt: string
  }

  // --------------- Inbox de Respostas ---------------

  export interface InboxEntry {
    id: string
    customerHash: string
    customerName: string | null
    phone: string | null
    segment: string | null
    optOut: boolean
    receivedAt: string
  }

  // --------------- Webhooks ---------------

  export interface WebhookConfig {
    id: string
    targetUrl: string
    events: string[]
    enabled: boolean
    createdAt: string
    lastDelivery?: {
      status: string
      responseCode: number | null
      createdAt: string
    } | null
  }

  export interface WebhookDelivery {
    id: string
    configId: string
    event: string
    status: string
    responseCode: number | null
    attempts: number
    createdAt: string
  }

  // --------------- Templates de Mensagem ---------------

  export interface MessageTemplate {
    id: string
    name: string
    segment: 'at_risk' | 'lost' | 'all'
    content: string
    isActive: boolean
    createdAt: string
    updatedAt: string
  }

  // --------------- Campanhas ---------------

  export interface Campaign {
    id: string
    name: string
    segment: string | null
    branch: string | null
    salesperson: string | null
    messageContent: string
    status: 'draft' | 'sending' | 'sent' | 'failed'
    targetCount: number
    sentCount: number
    createdAt: string
    sentAt: string | null
  }

  // --------------- Log de Auditoria ---------------

  export interface AuditEntry {
    id: string
    userId: string | null
    userName: string | null
    action: string
    resourceType: string | null
    resourceId: string | null
    details: Record<string, unknown>
    ip?: string | null
    userAgent?: string | null
    createdAt: string
  }

  // --------------- Segurança: MFA & Sessões ---------------

  export interface MfaStatus {
    enabled: boolean
    backupCodesRemaining: number
  }

  export interface MfaSetup {
    qrcode: string
    secret: string
  }

  export interface UserSessionEntry {
    id: string
    ip: string | null
    userAgent: string | null
    createdAt: string | null
    lastSeenAt: string | null
    current: boolean
  }

  // --------------- SSO & Provisionamento (SCIM) ---------------

  export interface SSOConnection {
    id: string
    protocol: 'oidc' | 'saml'
    displayName: string | null
    enabled: boolean
    defaultRole: 'admin' | 'analyst' | 'viewer'
    allowedDomains: string[]
    createdAt: string | null
    loginUrl: string
    callbackUrl: string
    metadataUrl: string | null
  }

  export interface SSOConnectionsResult {
    slug: string
    connections: SSOConnection[]
  }

  export interface SSODiscovery {
    found: boolean
    protocol?: 'oidc' | 'saml'
    loginUrl?: string
    displayName?: string | null
  }

  export interface ScimTokenResult {
    token: string
    scimBaseUrl: string
  }

  // --------------- Previsão de Receita ---------------

  export interface ForecastMonth {
    month: string
    projectedRevenue: number
    confidenceLow: number
    confidenceHigh: number
  }

  export interface ForecastData {
    months: ForecastMonth[]
    trend: 'up' | 'down' | 'flat'
    avgMonthlyGrowth: number
  }
