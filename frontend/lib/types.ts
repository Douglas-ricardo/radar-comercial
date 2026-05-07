//lib/types.ts
// ===========================================
// Radar Comercial - Type Definitions
// ===========================================

// User & Auth Types
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

// File & Analysis Types
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
}

export interface AnalysisResult {
  id: string
  fileId: string
  createdAt: string
  summary: AnalysisSummary
  charts: ChartData
  opportunities: Opportunity[]
}

export interface AnalysisSummary {
  totalRevenue: number
  lostRevenue: number
  lostRate: number
  period: string
  totalTransactions: number
  uniqueCustomers: number
  uniqueProducts: number
}

export interface ChartData {
  timeSeries: TimeSeriesPoint[]
  customerDistribution: CustomerDistPoint[]
  productGaps: ProductGap[]
  seasonality: SeasonalityPoint[]
}

export interface TimeSeriesPoint {
  date: string
  revenue: number
  lostRevenue: number
}

export interface CustomerDistPoint {
  customer: string
  revenue: number
  percentage: number
}

export interface ProductGap {
  product: string
  expectedRevenue: number
  actualRevenue: number
  gap: number
}

export interface SeasonalityPoint {
  month: string
  revenue: number
  avgRevenue: number
  variance: number
}

export interface Opportunity {
  id: string
  type: 'missing_sale' | 'declining_customer' | 'seasonal_gap' | 'product_gap'
  customer: string
  product?: string
  expectedValue: number
  lastPurchase?: string
  frequency?: string
  confidence: 'high' | 'medium' | 'low'
  description: string
}

// Team Types
export interface TeamMember {
  id: string
  userId: string
  companyId: string
  user: {
    name: string
    email: string
  }
  role: 'admin' | 'analyst' | 'viewer'
  invitedAt: string
  acceptedAt?: string
  status: 'pending' | 'active'
}

export interface TeamInvite {
  email: string
  role: 'admin' | 'analyst' | 'viewer'
}

// Settings Types
export interface CompanySettings {
  name: string
  cnpj?: string
  logo?: string
}

export interface ApiKey {
  id: string
  name: string
  key: string
  createdAt: string
  lastUsedAt?: string
}

// API Response Types
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

// Form Types
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
