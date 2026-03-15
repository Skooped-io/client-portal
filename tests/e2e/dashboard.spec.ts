import { test, expect } from "@playwright/test"

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login")
    await page.fill('input[name="email"]', "test@skooped.io")
    await page.fill('input[name="password"]', "TestPassword123!")
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
  })

  test("displays welcome message", async ({ page }) => {
    await expect(page.locator("text=Welcome back")).toBeVisible({ timeout: 5000 })
  })

  test("displays 4 stat cards", async ({ page }) => {
    await expect(page.locator('[data-testid="stat-card"]')).toHaveCount(4, {
      timeout: 5000,
    })
  })

  test("displays Quick Actions section", async ({ page }) => {
    await expect(page.locator("text=Quick Actions")).toBeVisible()
  })

  test("sidebar navigation: Dashboard is active", async ({ page }) => {
    const activeLink = page.locator("a[href='/dashboard'].bg-strawberry\\/10")
    await expect(activeLink).toBeVisible()
  })

  test("sidebar navigation: click Analytics goes to /analytics", async ({ page }) => {
    await page.click("text=Analytics")
    await expect(page).toHaveURL(/\/analytics/)
    await expect(page.locator("text=Analytics dashboard coming soon")).toBeVisible()
  })

  test("sidebar navigation: click Settings goes to /settings", async ({ page }) => {
    await page.click("nav >> text=Settings")
    await expect(page).toHaveURL(/\/settings/)
  })

  test("sidebar navigation: all nav items are present", async ({ page }) => {
    for (const label of ["Dashboard", "Analytics", "SEO", "Social", "Ads", "Website", "Messages", "Settings"]) {
      await expect(page.locator(`nav >> text=${label}`)).toBeVisible()
    }
  })
})
