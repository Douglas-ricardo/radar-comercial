// lib/format.ts
export function formatCurrency(value: number | undefined | null): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
  }).format(value ?? 0)
}