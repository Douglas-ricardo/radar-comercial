'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Lock, AlertCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/auth-context'

export default function SetPasswordPage() {
  const router = useRouter()
  const { user, updateUser } = useAuth()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }
    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.')
      return
    }

    setIsLoading(true)
    try {
      const res = await api.auth.setPassword(password)
      if (!res.success) {
        setError(res.error ?? 'Erro ao definir a senha.')
        return
      }
      // Marca usuário como ativo localmente
      updateUser({ status: 'active' })
      router.push('/dashboard')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="auth-2026 flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md rounded-2xl shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
            Defina sua senha
          </CardTitle>
          <CardDescription>
            {user?.name ? `Olá, ${user.name}! ` : ''}
            Você foi convidado com uma senha temporária. Crie uma senha pessoal para continuar.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive" className="rounded-xl">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <FieldGroup>
              <Field>
                <FieldLabel>Nova senha</FieldLabel>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Mínimo 8 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-9"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>

              <Field>
                <FieldLabel>Confirmar senha</FieldLabel>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Repita a senha"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </Field>
            </FieldGroup>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <><Spinner className="mr-2 h-4 w-4" /> Salvando...</>
              ) : (
                'Definir senha e entrar'
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Ao continuar, você concorda com nossos{' '}
              <a href="/termos" className="underline hover:text-foreground">Termos de Uso</a>.
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
