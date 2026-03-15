import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

const mockEq = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: vi.fn(() =>
          Promise.resolve({ data: { user: { id: "test-user-id" } } })
        ),
      },
      from: vi.fn(() => ({
        update: vi.fn(() => ({ eq: mockEq })),
      })),
    })
  ),
}))

vi.mock("@/lib/supabase/helpers", () => ({
  getCurrentOrgId: vi.fn(() => Promise.resolve("test-org-id")),
}))

// Import after mocks are set up
const { updateBusinessProfileAction } = await import("../actions")

beforeEach(() => {
  vi.clearAllMocks()
  mockEq.mockResolvedValue({ error: null })
})

describe("updateBusinessProfileAction", () => {
  it("succeeds with valid business name", async () => {
    const formData = new FormData()
    formData.set("business_name", "Test Business")
    formData.set("city", "Franklin")
    formData.set("state", "TN")

    const result = await updateBusinessProfileAction(formData)
    expect(result.success).toBe(true)
  })

  it("fails with empty business name", async () => {
    const formData = new FormData()
    formData.set("business_name", "")

    const result = await updateBusinessProfileAction(formData)
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it("fails with invalid phone", async () => {
    const formData = new FormData()
    formData.set("business_name", "Test Business")
    formData.set("phone", "not-a-phone")

    const result = await updateBusinessProfileAction(formData)
    expect(result.success).toBe(false)
  })

  it("fails with invalid email", async () => {
    const formData = new FormData()
    formData.set("business_name", "Test Business")
    formData.set("email", "bad-email")

    const result = await updateBusinessProfileAction(formData)
    expect(result.success).toBe(false)
  })

  it("fails with invalid website url", async () => {
    const formData = new FormData()
    formData.set("business_name", "Test Business")
    formData.set("website_url", "not-a-url")

    const result = await updateBusinessProfileAction(formData)
    expect(result.success).toBe(false)
  })

  it("returns error when supabase update fails", async () => {
    mockEq.mockResolvedValueOnce({ error: { message: "DB error" } })

    const formData = new FormData()
    formData.set("business_name", "Test Business")

    const result = await updateBusinessProfileAction(formData)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Failed to update")
  })
})
