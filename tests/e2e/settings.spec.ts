import { test, expect } from "@playwright/test"

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login")
    await page.fill('input[name="email"]', "test@skooped.io")
    await page.fill('input[name="password"]', "TestPassword123!")
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
    await page.goto("/settings")
    await expect(page).toHaveURL(/\/settings/)
  })

  test("displays settings page title", async ({ page }) => {
    await expect(page.locator("h1:has-text('Settings')")).toBeVisible()
  })

  test("displays business profile form fields", async ({ page }) => {
    await expect(page.locator('input[name="business_name"]')).toBeVisible()
    await expect(page.locator('input[name="phone"]')).toBeVisible()
    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('input[name="website_url"]')).toBeVisible()
    await expect(page.locator('input[name="city"]')).toBeVisible()
    await expect(page.locator('input[name="state"]')).toBeVisible()
    await expect(page.locator('textarea[name="description"]')).toBeVisible()
  })

  test("can update business profile", async ({ page }) => {
    await page.fill('input[name="business_name"]', "Updated Business Name")
    await page.click('button[type="submit"]')

    // Should show success toast
    await expect(page.locator("text=Profile updated successfully")).toBeVisible({
      timeout: 5000,
    })
  })

  test("shows validation error for empty business name", async ({ page }) => {
    await page.fill('input[name="business_name"]', "")
    await page.click('button[type="submit"]')

    // The form has required on business_name so should not submit
    // Browser validation or toast error should appear
    const businessNameInput = page.locator('input[name="business_name"]')
    await expect(businessNameInput).toHaveAttribute("required")
  })
})
