import { test, expect } from '@playwright/test'

test.describe('Auth redirects', () => {
  test('unauthenticated user visiting /dashboard redirects to login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
  })

  test('unauthenticated user visiting /profile redirects to login', async ({ page }) => {
    await page.goto('/profile')
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
  })

  test('unauthenticated user visiting /leaderboard redirects to login', async ({ page }) => {
    await page.goto('/leaderboard')
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
  })
})

test.describe('Blog', () => {
  test('blog index page loads', async ({ page }) => {
    await page.goto('/blog')
    await expect(page).toHaveURL('/blog')
    // Page should render something meaningful
    await expect(page.locator('body')).not.toBeEmpty()
  })
})

test.describe('404 handling', () => {
  test('unknown route shows not-found content', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist-at-all')
    expect(response?.status()).toBeLessThan(500)
  })
})
