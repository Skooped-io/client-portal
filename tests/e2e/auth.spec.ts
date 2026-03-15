import { test, expect } from "@playwright/test"

test.describe("Authentication", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/login/)
  })

  test("shows login form", async ({ page }) => {
    await page.goto("/login")
    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test("shows signup form", async ({ page }) => {
    await page.goto("/signup")
    await expect(page.locator('input[name="full_name"]')).toBeVisible()
    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
  })

  test("shows error for invalid credentials", async ({ page }) => {
    await page.goto("/login")
    await page.fill('input[name="email"]', "notauser@example.com")
    await page.fill('input[name="password"]', "wrongpassword")
    await page.click('button[type="submit"]')

    // Should stay on login and show error
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator(".text-destructive, [class*='destructive']")).toBeVisible({
      timeout: 5000,
    })
  })

  test("can log in with valid credentials", async ({ page }) => {
    await page.goto("/login")
    await page.fill('input[name="email"]', "test@skooped.io")
    await page.fill('input[name="password"]', "TestPassword123!")
    await page.click('button[type="submit"]')

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
  })

  test("can log out", async ({ page }) => {
    // Login first
    await page.goto("/login")
    await page.fill('input[name="email"]', "test@skooped.io")
    await page.fill('input[name="password"]', "TestPassword123!")
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })

    // Click logout
    await page.click('[data-testid="logout-button"]')
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
  })

  test("redirects authenticated users away from login page", async ({ page }) => {
    // Login first
    await page.goto("/login")
    await page.fill('input[name="email"]', "test@skooped.io")
    await page.fill('input[name="password"]', "TestPassword123!")
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })

    // Try to go back to login
    await page.goto("/login")
    await expect(page).toHaveURL(/\/dashboard/)
  })
})
