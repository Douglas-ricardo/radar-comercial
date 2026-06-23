import * as Sentry from '@sentry/nextjs'

export async function register() {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return // degrada sem DSN
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || 'production',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
  })
}

export const onRequestError = Sentry.captureRequestError
