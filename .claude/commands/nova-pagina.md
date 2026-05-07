Você está no projeto **Radar Comercial** (Next.js 16 + TypeScript + shadcn/ui + Tailwind CSS 4).

Crie uma nova página no dashboard seguindo **todos** os padrões do projeto.

## Localização
`frontend/app/dashboard/{rota}/page.tsx`

## Estrutura base obrigatória

```tsx
'use client'

import { useAuth } from '@/lib/auth/auth-context'
import { DashboardHeader } from '@/components/dashboard/header'
import { Skeleton } from '@/components/ui/skeleton'
// ... outros imports de @/components/ui/

export default function NomeDaPagina() {
  const { user, company } = useAuth()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!company?.id) return
    // buscar dados via api.* de @/lib/api/client
  }, [company])

  return (
    <div className="flex flex-col min-h-screen">
      <DashboardHeader
        title="Título da Página"
        description="Subtítulo descritivo"
      />
      <div className="flex-1 space-y-8 p-6 md:p-8 max-w-[1600px] mx-auto w-full">
        {/* conteúdo */}
      </div>
    </div>
  )
}
```

## Regras do projeto

**Chamadas de API:** sempre via `api.*` de `@/lib/api/client` — nunca `fetch` direto. Usar `credentials: 'include'` já está encapsulado no client.

**Auth:** dados do usuário e empresa via `useAuth()` de `@/lib/auth/auth-context`. Nunca ler cookie ou localStorage diretamente.

**Loading states:** sempre mostrar `<Skeleton>` enquanto `isLoading`. Nunca deixar a página em branco.

**Tipos:** definir interfaces em `frontend/types/` se forem reutilizáveis; inline se forem locais.

**Componentes UI:** usar exclusivamente `@/components/ui/*` (shadcn/ui). Não instalar novas libs de UI sem discutir.

**Formatação de valores:** usar `formatCurrency` de `@/lib/format` para BRL.

**Rota protegida:** a página é automaticamente protegida pelo layout em `app/dashboard/layout.tsx` — não precisa de guard manual.

**Hooks de dados:** se a lógica de fetch for complexa ou reusável, extrair para `frontend/hooks/use-{recurso}.ts` seguindo o padrão de `use-insights.ts`.

---

Tarefa: $ARGUMENTS
