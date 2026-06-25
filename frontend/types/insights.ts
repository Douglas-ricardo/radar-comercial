// types/insights.ts
export interface InsightsSummary {
  totalRevenue: number
  lostRevenue: number
  lostRate: number
  revenueGrowth: number   // delta % vs. período anterior
  uniqueCustomers: number
  uniqueProducts: number
}

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
  branch?: string | null
  salesperson?: string | null
  recoveryScore?: number
  recoveryBand?: 'alta' | 'media' | 'baixa'
  recoveryReasons?: string[]
  priorityValue?: number
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