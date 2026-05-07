Você está no projeto **Radar Comercial** (Next.js 16 + TypeScript).

Crie um novo React hook de busca de dados seguindo os padrões do projeto.

## Localização
`frontend/hooks/use-{recurso}.ts`

## Estrutura base

```typescript
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@/lib/api/client'
import type { TipoDoRetorno } from '@/types'

interface UseRecursoReturn {
  data: TipoDoRetorno | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useRecurso(
  companyId: string | undefined,
  // outros parâmetros necessários
): UseRecursoReturn {
  const [data, setData] = useState<TipoDoRetorno | null>(null)
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
      const response = await api.recurso.get(companyId, { signal })

      if (signal.aborted) return

      if (response.success && response.data) {
        setData(response.data)
      } else {
        setError(response.error ?? 'Erro ao carregar dados.')
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError('Falha na conexão. Tente novamente.')
    } finally {
      if (!signal.aborted) setIsLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    fetchData()
    return () => abortRef.current?.abort()
  }, [fetchData])

  return { data, isLoading, error, refetch: fetchData }
}
```

## Regras obrigatórias

- **AbortController:** sempre usar para cancelar requests quando o componente desmonta ou os parâmetros mudam — evita atualizações de estado em componente desmontado
- **`signal.aborted` check:** verificar antes de `setData` e no `finally` antes de `setIsLoading`
- **`companyId` guard:** se `companyId` for undefined, sair cedo com `isLoading: false`
- **Tipos:** definir interface de retorno explícita; nunca usar `any`
- **AbortError:** capturar e ignorar silenciosamente (não é um erro real)

## Se precisar de parâmetros que mudam (ex: filtros)

Incluir os parâmetros no `useCallback` dependency array. Ver `use-insights.ts` como referência para filtros de data.

## Se a rota ainda não existe no `api/client.ts`

Adicionar o método correspondente em `frontend/lib/api/client.ts` seguindo os padrões existentes (`fetchWithAuth`, `credentials: 'include'`).

---

Tarefa: $ARGUMENTS
