import { describe, it, expect } from "vitest"
import { cn, formatNumber, getInitials } from "../utils"

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500")
  })

  it("handles conditional classes", () => {
    expect(cn("base", true && "active", false && "inactive")).toBe("base active")
  })

  it("handles undefined values", () => {
    expect(cn("base", undefined)).toBe("base")
  })
})

describe("formatNumber", () => {
  it("formats numbers under 1000 as-is", () => {
    expect(formatNumber(999)).toBe("999")
    expect(formatNumber(0)).toBe("0")
  })

  it("formats thousands with K suffix", () => {
    expect(formatNumber(1000)).toBe("1.0K")
    expect(formatNumber(1500)).toBe("1.5K")
    expect(formatNumber(999999)).toBe("1000.0K")
  })

  it("formats millions with M suffix", () => {
    expect(formatNumber(1_000_000)).toBe("1.0M")
    expect(formatNumber(2_500_000)).toBe("2.5M")
  })
})

describe("getInitials", () => {
  it("returns two initials for a full name", () => {
    expect(getInitials("Jane Smith")).toBe("JS")
  })

  it("returns one initial for a single name", () => {
    expect(getInitials("Jane")).toBe("J")
  })

  it("returns max two initials for long names", () => {
    expect(getInitials("Jane Ann Smith")).toBe("JA")
  })

  it("returns uppercase initials", () => {
    expect(getInitials("jane smith")).toBe("JS")
  })
})
