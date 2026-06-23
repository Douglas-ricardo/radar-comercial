import { test, expect } from '@playwright/test'

test('landing: proposta de valor + CTA visíveis', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /clientes somem/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /Começar grátis/i }).first()).toBeVisible()
})

test('login: formulário renderiza', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByLabel(/Email corporativo/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /Entrar/i })).toBeVisible()
})

test('signup: campos renderizam', async ({ page }) => {
  await page.goto('/signup')
  await expect(page.getByLabel(/Nome completo/i)).toBeVisible()
  await expect(page.getByLabel(/Nome da empresa/i)).toBeVisible()
})

test('dashboard exige login (ProtectedRoute redireciona)', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
})
