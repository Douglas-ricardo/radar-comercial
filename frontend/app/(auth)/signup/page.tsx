//app/(auth)/signup/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { AlertCircle, Eye, EyeOff, CheckCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

function validatePassword(password: string) {
  return {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
  }
}

export default function SignupPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    companyName: '',
    cnpj: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { signup } = useAuth()
  const router = useRouter()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const passwordValidation = validatePassword(formData.password)
  const isPasswordValid = Object.values(passwordValidation).every(Boolean)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError('As senhas não conferem.')
      return
    }

    if (!isPasswordValid) {
      setError('A senha não atende aos requisitos mínimos.')
      return
    }

    setIsLoading(true)
    try {
      await signup({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        companyName: formData.companyName,
        cnpj: formData.cnpj || undefined,
      })
      router.push('/onboarding')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="font-serif text-2xl tracking-[-0.01em]">Criar conta</CardTitle>
        <CardDescription>
          Comece a descobrir oportunidades de vendas perdidas
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div aria-live="polite" aria-atomic="true">
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertDescription id="signup-error">{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Nome completo</FieldLabel>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder="Seu nome"
                value={formData.name}
                onChange={handleChange}
                required
                disabled={isLoading}
                autoComplete="name"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="seu@email.com"
                value={formData.email}
                onChange={handleChange}
                required
                autoComplete="email"
                disabled={isLoading}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="companyName">Nome da empresa</FieldLabel>
              <Input
                id="companyName"
                name="companyName"
                type="text"
                placeholder="Empresa Ltda"
                value={formData.companyName}
                onChange={handleChange}
                required
                disabled={isLoading}
                autoComplete="organization"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="cnpj">CNPJ (opcional)</FieldLabel>
              <Input
                id="cnpj"
                name="cnpj"
                type="text"
                placeholder="00.000.000/0001-00"
                value={formData.cnpj}
                onChange={handleChange}
                disabled={isLoading}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="password">Senha</FieldLabel>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  disabled={isLoading}
                  autoComplete="new-password"
                  aria-describedby="password-requirements"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={showPassword}
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
              {formData.password && (
                <div
                  id="password-requirements"
                  className="mt-2 space-y-1 text-xs"
                  role="status"
                  aria-label="Requisitos da senha"
                >
                  <PasswordRequirement
                    met={passwordValidation.minLength}
                    text="Mínimo 8 caracteres"
                  />
                  <PasswordRequirement
                    met={passwordValidation.hasUppercase}
                    text="Uma letra maiúscula"
                  />
                  <PasswordRequirement
                    met={passwordValidation.hasLowercase}
                    text="Uma letra minúscula"
                  />
                  <PasswordRequirement
                    met={passwordValidation.hasNumber}
                    text="Um número"
                  />
                </div>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="confirmPassword">Confirmar senha</FieldLabel>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                disabled={isLoading}
                autoComplete="new-password"
                aria-describedby={error ? 'signup-error' : undefined}
              />
            </Field>
          </FieldGroup>

          <Button type="submit" className="w-full" disabled={isLoading} aria-busy={isLoading}>
            {isLoading ? (
              <>
                <Spinner className="mr-2 h-4 w-4" aria-hidden="true" />
                Criando conta...
              </>
            ) : (
              'Criar conta gratuita'
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Ao criar uma conta, você concorda com nossos{' '}
            <Link href="/terms" className="text-primary hover:underline">
              Termos de Serviço
            </Link>{' '}
            e{' '}
            <Link href="/privacy" className="text-primary hover:underline">
              Política de Privacidade
            </Link>
          </p>
        </form>
      </CardContent>
      <CardFooter>
        <p className="w-full text-center text-sm text-muted-foreground">
          Já tem uma conta?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}

function PasswordRequirement({ met, text }: { met: boolean; text: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${met ? 'text-success' : 'text-muted-foreground'}`}>
      <CheckCircle
        className={`h-3 w-3 ${met ? 'text-success' : 'text-muted-foreground/50'}`}
        aria-hidden="true"
      />
      <span>{text}</span>
    </div>
  )
}
