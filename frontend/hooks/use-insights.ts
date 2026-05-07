'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@/lib/api/client'
import type { InsightsData } from '@/types'

interface UseInsightsReturn {
  data: InsightsData | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useInsights(
  companyId: string | undefined,
  dateRange: string
): UseInsightsReturn {
  const [data, setData] = useState<InsightsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async () => {
    if (!companyId) {
      setIsLoading(false)
      return
    }

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    setIsLoading(true)
    setError(null)

    try {
      const response = await api.insights.get(
        companyId,
        { dateRange },
        { signal }
      )

      // Ignorar resultado se a request foi abortada
      if (signal.aborted) return

      if (response.success && response.data) {
        setData(response.data)
      } else {
        setError(response.error ?? 'Não foi possível carregar os insights.')
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError('Falha na conexão. Verifique sua internet e tente novamente.')
    } finally {
      // Só atualiza loading se a request não foi abortada
      if (!signal.aborted) {
        setIsLoading(false)
      }
    }
  }, [companyId, dateRange])

  useEffect(() => {
    fetchData()
    return () => abortRef.current?.abort()
  }, [fetchData])

  return { data, isLoading, error, refetch: fetchData }
}
