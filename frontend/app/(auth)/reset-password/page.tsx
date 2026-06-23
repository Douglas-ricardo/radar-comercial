'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Lock, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { api } from '@/lib/api/client'

function ResetPasswordForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  if (!token) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        <AlertDescription>
          Link inválido ou expirado. Solicite um novo link em{' '}
          <Link href="/forgot-password" className="underline font-medium">
            recuperar senha
          </Link>.
        </AlertDescription>
      </Alert>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }

    setIsLoading(true)
    try {
      const res = await api.auth.resetPassword(token, password)
      if (res.success) {
        setSuccess(true)
        setTimeout(() => router.push('/login'), 3000)
      } else {
        setError(res.error ?? 'Erro ao redefinir senha.')
      }
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <Alert className="border-success/30 bg-success/10 text-foreground">
        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
        <AlertDescription>
          Senha redefinida com sucesso! Redirecionando para o login...
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div aria-live="polite" aria-atomic="true">
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="password">Nova senha</FieldLabel>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              disabled={isLoading}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor="confirm">Confirmar senha</FieldLabel>
          <Input
            id="confirm"
            type="password"
            placeholder="Repita a senha"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            disabled={isLoading}
          />
        </Field>
      </FieldGroup>

      <Button
        type="submit"
        className="w-full"
        disabled={isLoading || !password || !confirm}
      >
        {isLoading ? (
          <>
            <Spinner className="mr-2 h-4 w-4" aria-hidden="true" />
            Redefinindo...
          </>
        ) : (
          'Redefinir senha'
        )}
      </Button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Lock className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <CardTitle className="font-serif text-2xl tracking-[-0.01em]">Redefinir senha</CardTitle>
        <CardDescription>Escolha uma nova senha para sua conta</CardDescription>
      </CardHeader>

      <CardContent>
        <Suspense fallback={<Spinner className="mx-auto h-6 w-6" />}>
          <ResetPasswordForm />
        </Suspense>
      </CardContent>

      <CardFooter className="justify-center">
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Voltar ao login
        </Link>
      </CardFooter>
    </Card>
  )
}
