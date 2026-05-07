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
    ownerId: string
    createdAt: string
    updatedAt: string
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
    document: string | null
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
    status: 'pending' | 'active'
    createdAt?: string | null
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
    updatedAt: string | null
  }

  export interface CarteiraOpportunity extends Opportunity {
    customerHash: string
    daysInactive: number
    action: OpportunityAction
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
  