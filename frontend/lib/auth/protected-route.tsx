'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './auth-context'
import { Spinner } from '@/components/ui/spinner'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRoles?: Array<'admin' | 'analyst' | 'viewer'>
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    // Usuário convidado com senha temporária precisa trocá-la antes de qualquer página
    if (user && user.status === 'pending') {
      router.push('/set-password')
      return
    }
    if (requiredRoles && user && !requiredRoles.includes(user.role)) {
      router.push('/dashboard')
    }
  }, [isAuthenticated, isLoading, requiredRoles, user, router])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-8 w-8 text-primary" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return null

  if (user && user.status === 'pending') return null

  if (requiredRoles && user && !requiredRoles.includes(user.role)) return null

  return <>{children}</>
}
