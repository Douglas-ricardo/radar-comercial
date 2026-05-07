'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@/lib/api/client'
import type { CustomerDetail } from '@/types'

interface UseCustomerDetailReturn {
  data: CustomerDetail | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useCustomerDetail(
  companyId: string | undefined,
  customerId: string
): UseCustomerDetailReturn {
  const [data, setData] = useState<CustomerDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async () => {
    if (!companyId || !customerId) {
      setIsLoading(false)
      return
    }

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    setIsLoading(true)
    setError(null)

    try {
      const response = await api.customers.getById(companyId, customerId, { signal })

      if (signal.aborted) return

      if (response.success && response.data) {
        setData(response.data)
      } else {
        setError(response.error ?? 'Não foi possível carregar os dados do cliente.')
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError('Falha na conexão. Tente novamente.')
    } finally {
      if (!signal.aborted) {
        setIsLoading(false)
      }
    }
  }, [companyId, customerId])

  useEffect(() => {
    fetchData()
    return () => abortRef.current?.abort()
  }, [fetchData])

  return { data, isLoading, error, refetch: fetchData }
}
