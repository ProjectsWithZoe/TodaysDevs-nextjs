import { test, expect } from '@playwright/test'

// Mock the better-auth session endpoint so the Landing page resolves
// to "no session" immediately rather than hanging on localhost:3001.
async function mockNoSession(page) {
  await page.route('**/api/auth/get-session', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: null, user: null }) })
  )
}

test.describe('Landing page', () => {
  test('renders key content', async ({ page }) => {
    await mockNoSession(page)
    await page.goto('/')
    await expect(page).toHaveTitle(/Today's Devs|TodaysDevs/i)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('has sign in and register links', async ({ page }) => {
    await mockNoSession(page)
    await page.goto('/')
    await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /get started|register|sign up/i }).first()).toBeVisible()
  })

  test('sign in link navigates to /login', async ({ page }) => {
    await mockNoSession(page)
    await page.goto('/')
    await page.getByRole('link', { name: /sign in|log in/i }).first().click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('shows stats section', async ({ page }) => {
    await mockNoSession(page)
    await page.goto('/')
    // The landing has STATS array entries like "25%", "$127k" etc.
    await expect(page.getByText('25%')).toBeVisible()
  })

  test('no JS errors on load', async ({ page }) => {
    await mockNoSession(page)
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    expect(errors).toHaveLength(0)
  })
})
