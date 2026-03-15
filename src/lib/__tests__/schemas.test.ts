import { describe, it, expect } from "vitest"
import { signupSchema, loginSchema, businessProfileSchema } from "../schemas"

describe("signupSchema", () => {
  it("accepts valid signup data", () => {
    const result = signupSchema.safeParse({
      full_name: "Jane Smith",
      email: "jane@example.com",
      password: "Password123!",
    })
    expect(result.success).toBe(true)
  })

  it("rejects empty full name", () => {
    const result = signupSchema.safeParse({
      full_name: "",
      email: "jane@example.com",
      password: "Password123!",
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain("full_name")
  })

  it("rejects invalid email", () => {
    const result = signupSchema.safeParse({
      full_name: "Jane",
      email: "not-an-email",
      password: "Password123!",
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain("email")
  })

  it("rejects password shorter than 8 characters", () => {
    const result = signupSchema.safeParse({
      full_name: "Jane",
      email: "jane@example.com",
      password: "short",
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain("password")
  })
})

describe("loginSchema", () => {
  it("accepts valid login data", () => {
    const result = loginSchema.safeParse({
      email: "jane@example.com",
      password: "password",
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({
      email: "not-email",
      password: "password",
    })
    expect(result.success).toBe(false)
  })

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      email: "jane@example.com",
      password: "",
    })
    expect(result.success).toBe(false)
  })
})

describe("businessProfileSchema", () => {
  it("accepts valid full profile", () => {
    const result = businessProfileSchema.safeParse({
      business_name: "Gunns Fencing",
      industry: "Home Services",
      phone: "6155551234",
      email: "info@gunnsfencing.com",
      website_url: "https://gunnsfencing.com",
      city: "Franklin",
      state: "TN",
      description: "Quality fencing services in Middle Tennessee.",
    })
    expect(result.success).toBe(true)
  })

  it("accepts minimal data with only business name", () => {
    const result = businessProfileSchema.safeParse({
      business_name: "Test Business",
    })
    expect(result.success).toBe(true)
  })

  it("rejects empty business name", () => {
    const result = businessProfileSchema.safeParse({
      business_name: "",
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain("business_name")
  })

  it("rejects invalid phone format", () => {
    const result = businessProfileSchema.safeParse({
      business_name: "Test",
      phone: "not-a-phone",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid email", () => {
    const result = businessProfileSchema.safeParse({
      business_name: "Test",
      email: "bad-email",
    })
    expect(result.success).toBe(false)
  })

  it("accepts empty string for optional url fields", () => {
    const result = businessProfileSchema.safeParse({
      business_name: "Test",
      website_url: "",
    })
    expect(result.success).toBe(true)
  })

  it("rejects malformed url when provided", () => {
    const result = businessProfileSchema.safeParse({
      business_name: "Test",
      website_url: "not-a-url",
    })
    expect(result.success).toBe(false)
  })

  it("accepts services and service_areas arrays", () => {
    const result = businessProfileSchema.safeParse({
      business_name: "Test",
      services: ["SEO", "Social Media"],
      service_areas: ["Franklin", "Nashville"],
    })
    expect(result.success).toBe(true)
  })
})
