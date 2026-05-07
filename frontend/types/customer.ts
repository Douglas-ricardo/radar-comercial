// types/customer.ts
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
  recencyScore: 1|2|3|4|5
  frequencyScore: 1|2|3|4|5
  valueScore: 1|2|3|4|5
  segment: 'champion' | 'loyal' | 'at_risk' | 'lost' | 'new'
}

export interface CustomerAlert {
  id: string
  type: 'missing_sale' | 'declining_customer' | 'seasonal_gap' | 'product_gap'
  description: string
  expectedValue: number
  confidence: 'high' | 'medium' | 'low'
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
