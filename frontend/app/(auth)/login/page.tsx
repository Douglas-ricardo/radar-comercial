//app/(auth)/login/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/auth-context'
import { api } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { AlertCircle, Eye, EyeOff, ArrowRight, Mail, Lock, Radar, ShieldCheck, KeyRound } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // 2º passo (MFA)
  const [mfaToken, setMfaToken] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')

  // SSO
  const [ssoLoading, setSsoLoading] = useState(false)

  const { login, verifyMfa } = useAuth()
  const router = useRouter()

  // Mostra erro de SSO vindo do callback (?sso_error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ssoErr = params.get('sso_error')
    if (ssoErr) {
      const map: Record<string, string> = {
        forbidden: 'Acesso via SSO não autorizado para este domínio.',
        state: 'Sessão de SSO expirada. Tente novamente.',
        exchange: 'Falha ao autenticar com o provedor de identidade.',
        saml: 'Falha na autenticação SAML.',
        conn: 'Conexão SSO não encontrada.',
      }
      setError(map[ssoErr] ?? 'Falha no login via SSO.')
    }
  }, [])

  const handleSso = async () => {
    if (!email) {
      setError('Digite seu e-mail corporativo para entrar via SSO.')
      return
    }
    setError('')
    setSsoLoading(true)
    try {
      const res = await api.sso.discover(email)
      if (res.success && res.data?.found && res.data.loginUrl) {
        window.location.href = res.data.loginUrl
      } else {
        setError('Nenhum login SSO configurado para este domínio. Use email e senha.')
        setSsoLoading(false)
      }
    } catch {
      setError('Não foi possível iniciar o SSO. Tente novamente.')
      setSsoLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const result = await login({ email, password })
      if (result && 'mfaRequired' in result) {
        setMfaToken(result.mfaToken)
        return
      }
      router.push('/dashboard')
    } catch {
      setError('Email ou senha incorretos. Verifique e tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mfaToken) return
    setError('')
    setIsLoading(true)
    try {
      await verifyMfa(mfaToken, mfaCode)
      router.push('/dashboard')
    } catch {
      setError('Código inválido. Tente novamente ou use um código de backup.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-[80vh] w-full flex-col items-center justify-center relative">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/[0.06] via-background to-background" />

      <Card className="w-full max-w-[400px] shadow-sm sm:rounded-2xl">
        <CardHeader className="space-y-3 pb-6 pt-8 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Radar className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <CardTitle className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-[-0.02em]">
            Bem-vindo de volta
          </CardTitle>
          <CardDescription className="text-base font-medium text-muted-foreground/80">
            Acesse o seu Radar Comercial
          </CardDescription>
        </CardHeader>

        {mfaToken ? (
          <CardContent className="pb-8">
            <form onSubmit={handleMfaSubmit} className="space-y-5" noValidate>
              <div aria-live="polite" aria-atomic="true">
                {error && (
                  <Alert variant="destructive" role="alert" className="border-destructive/30 bg-destructive/10 text-destructive">
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                    <AlertDescription className="ml-1 text-sm font-medium">{error}</AlertDescription>
                  </Alert>
                )}
              </div>
              <div className="flex flex-col items-center text-center gap-2 pb-1">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Digite o código de 6 dígitos do seu app autenticador (ou um código de backup).
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mfa-code" className="text-sm font-medium">Código de verificação</Label>
                <Input
                  id="mfa-code"
                  inputMode="numeric"
                  autoFocus
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  disabled={isLoading}
                  className="h-11 text-center text-lg tracking-[0.3em] tabular-nums"
                />
              </div>
              <Button type="submit" className="h-11 w-full text-base font-semibold" disabled={isLoading || mfaCode.length < 6} aria-busy={isLoading}>
                {isLoading ? (<><Spinner className="mr-2 h-4 w-4" />Verificando…</>) : (<>Verificar e entrar<ArrowRight className="ml-2 h-4 w-4" /></>)}
              </Button>
              <button
                type="button"
                onClick={() => { setMfaToken(null); setMfaCode(''); setError('') }}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Voltar ao login
              </button>
            </form>
          </CardContent>
        ) : (
        <CardContent className="pb-6">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Região live para leitores de tela */}
            <div aria-live="polite" aria-atomic="true">
              {error && (
                <Alert
                  variant="destructive"
                  role="alert"
                  className="animate-in fade-in slide-in-from-top-2 border-destructive/30 bg-destructive/10 text-destructive"
                >
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  <AlertDescription id="login-error" className="ml-1 text-sm font-medium">
                    {error}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email corporativo
                </Label>
                <div className="relative group">
                  <Mail
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary"
                    aria-hidden="true"
                  />
                  <Input
                    id="email"
                    type="email"
                    placeholder="voce@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={isLoading}
                    aria-describedby={error ? 'login-error' : undefined}
                    aria-invalid={!!error}
                    className="h-11 pl-10 transition-all focus-visible:ring-primary/30"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium">
                    Senha
                  </Label>
                  <Link
                    href="/forgot-password"
                    className="text-sm font-medium text-primary transition-colors hover:text-primary/80 hover:underline"
                    tabIndex={-1}
                  >
                    Esqueceu a senha?
                  </Link>
                </div>
                <div className="relative group">
                  <Lock
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary"
                    aria-hidden="true"
                  />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    disabled={isLoading}
                    aria-describedby={error ? 'login-error' : undefined}
                    aria-invalid={!!error}
                    className="h-11 px-10 transition-all focus-visible:ring-primary/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={showPassword}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                className="rounded-[4px]"
              />
              <label
                htmlFor="remember"
                className="text-sm font-medium leading-none text-muted-foreground cursor-pointer select-none"
              >
                Manter conectado
              </label>
            </div>

            <Button
              type="submit"
              className="h-11 w-full text-base font-semibold transition-colors"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" aria-hidden="true" />
                  Autenticando...
                </>
              ) : (
                <>
                  Entrar na plataforma
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/60" /></div>
              <div className="relative flex justify-center text-xs uppercase tracking-wider">
                <span className="bg-background px-2 text-muted-foreground">ou</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-11 w-full text-base font-medium"
              onClick={handleSso}
              disabled={ssoLoading}
            >
              {ssoLoading ? <Spinner className="mr-2 h-4 w-4" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Entrar com SSO
            </Button>
          </form>
        </CardContent>
        )}

        {!mfaToken && (
        <CardFooter className="flex flex-col space-y-4 pb-8">
          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/60" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider">
              <span className="bg-background px-2 text-muted-foreground">Novo por aqui?</span>
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Ainda não tem uma conta?{' '}
            <Link
              href="/signup"
              className="font-semibold text-primary transition-colors hover:text-primary/80 hover:underline"
            >
              Criar conta gratuitamente
            </Link>
          </p>
        </CardFooter>
        )}
      </Card>
    </div>
  )
}
