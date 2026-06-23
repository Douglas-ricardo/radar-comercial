'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Mail, CheckCircle2, ArrowLeft } from 'lucide-react'
import { api } from '@/lib/api/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      await api.auth.forgotPassword(email)
    } finally {
      setSubmitted(true)
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Mail className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <CardTitle className="font-serif text-2xl tracking-[-0.01em]">Recuperar senha</CardTitle>
        <CardDescription>
          {submitted
            ? 'Verifique sua caixa de entrada'
            : 'Digite seu email e enviaremos um link de recuperação'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {submitted ? (
          <Alert className="border-success/30 bg-success/10 text-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            <AlertDescription>
              Se o email <strong>{email}</strong> estiver cadastrado, você receberá um link
              para redefinir sua senha em alguns minutos. O link expira em 30 minutos.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={isLoading}
                />
              </Field>
            </FieldGroup>
            <Button type="submit" className="w-full" disabled={isLoading || !email}>
              {isLoading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" aria-hidden="true" />
                  Enviando...
                </>
              ) : (
                'Enviar link de recuperação'
              )}
            </Button>
          </form>
        )}
      </CardContent>

      <CardFooter className="justify-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Voltar ao login
        </Link>
      </CardFooter>
    </Card>
  )
}
