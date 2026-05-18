import { test, expect } from '@playwright/test'

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('renders login form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('has link to register page', async ({ page }) => {
    await page.getByRole('link', { name: /register/i }).click()
    await expect(page).toHaveURL(/\/register/)
  })

  test('has forgot password link', async ({ page }) => {
    await expect(page.getByRole('link', { name: /forgot password/i })).toBeVisible()
  })

  test('shows error on invalid credentials', async ({ page }) => {
    // Backend not running in test env — mock the better-auth sign-in endpoint
    await page.route('**/api/auth/sign-in/email', route =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }) })
    )
    await page.getByLabel(/email/i).fill('notauser@example.com')
    await page.locator('#password').fill('wrongpassword')
    await page.getByRole('button', { name: /sign in/i }).click()
    const errorAlert = page.locator('[role="alert"].field-error')
    await expect(errorAlert).toBeVisible({ timeout: 5000 })
    await expect(errorAlert).toContainText(/sign-in failed|check your email/i)
  })

  test('submit button shows loading state', async ({ page }) => {
    await page.getByLabel(/email/i).fill('test@example.com')
    await page.getByLabel(/password/i).fill('password123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByRole('button', { name: /signing in/i })).toBeVisible()
  })

  test('email input is required', async ({ page }) => {
    await page.getByRole('button', { name: /sign in/i }).click()
    const emailInput = page.getByLabel(/email/i)
    await expect(emailInput).toHaveAttribute('required')
  })
})

test.describe('Register page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register')
  })

  test('renders register form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /create account/i })).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.locator('#confirm')).toBeVisible()
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible()
  })

  test('has link back to login', async ({ page }) => {
    await page.getByRole('link', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('shows error when passwords do not match', async ({ page }) => {
    await page.getByLabel(/email/i).fill('test@example.com')
    await page.locator('#password').fill('password123')
    await page.locator('#confirm').fill('different456')
    await page.getByRole('button', { name: /create account/i }).click()
    await expect(page.locator('[role="alert"].field-error')).toContainText(/passwords do not match/i)
  })

  test('password field enforces minlength 8', async ({ page }) => {
    await expect(page.locator('#password')).toHaveAttribute('minlength', '8')
  })
})
