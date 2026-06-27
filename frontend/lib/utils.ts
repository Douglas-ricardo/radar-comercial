import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Moeda ativa (multi-país). Definida pelo AuthProvider a partir de company.currency.
let _activeCurrency = 'BRL'
const _localeFor: Record<string, string> = { BRL: 'pt-BR', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB' }

export function setActiveCurrency(currency?: string | null): void {
  if (currency && /^[A-Z]{3}$/.test(currency)) _activeCurrency = currency
}

export function formatCurrency(value: number | undefined | null): string {
  const locale = _localeFor[_activeCurrency] ?? 'pt-BR'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: _activeCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0)
}

export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
