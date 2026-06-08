import { describe, it, expect } from "vitest"
import { isValidIsoDate, monthPrefix, nextMonthString, parseLocalDate } from "@/lib/date-utils"

describe("parseLocalDate", () => {
  it("returns a Date with the requested local Y/M/D", () => {
    const d = parseLocalDate("2026-01-15")
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(15)
  })

  it("returns local midnight (h/m/s/ms all zero)", () => {
    const d = parseLocalDate("2026-05-12")
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
    expect(d.getSeconds()).toBe(0)
    expect(d.getMilliseconds()).toBe(0)
  })

  it("parses leap day correctly", () => {
    const d = parseLocalDate("2024-02-29")
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(1)
    expect(d.getDate()).toBe(29)
  })

  it("parses end-of-month correctly", () => {
    const d = parseLocalDate("2026-12-31")
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(11)
    expect(d.getDate()).toBe(31)
  })
})

describe("nextMonthString", () => {
  it("rolls Jan to Feb", () => {
    expect(nextMonthString("2026-01-01")).toBe("2026-02-01")
  })

  it("pads single-digit months in output (Aug → Sep)", () => {
    expect(nextMonthString("2026-08-01")).toBe("2026-09-01")
  })

  it("handles single-digit-to-double-digit boundary (Sep → Oct)", () => {
    expect(nextMonthString("2026-09-01")).toBe("2026-10-01")
  })

  it("rolls Dec to Jan of next year", () => {
    expect(nextMonthString("2026-12-01")).toBe("2027-01-01")
  })

  it("handles year boundary at end of a leap year (Dec 2024 → Jan 2025)", () => {
    expect(nextMonthString("2024-12-01")).toBe("2025-01-01")
  })
})

describe("monthPrefix", () => {
  it("extracts yyyy-MM from a yyyy-MM-dd string", () => {
    expect(monthPrefix("2026-05-12")).toBe("2026-05")
  })

  it("works for first-of-month strings", () => {
    expect(monthPrefix("2026-05-01")).toBe("2026-05")
  })

  it("works for December", () => {
    expect(monthPrefix("2026-12-31")).toBe("2026-12")
  })
})

describe("isValidIsoDate", () => {
  it("accepts a real calendar date", () => {
    expect(isValidIsoDate("2024-01-15")).toBe(true)
  })

  it("accepts a leap day in a leap year", () => {
    expect(isValidIsoDate("2024-02-29")).toBe(true)
  })

  it("rejects an impossible day that Date would roll over (2024-02-30)", () => {
    expect(isValidIsoDate("2024-02-30")).toBe(false)
  })

  it("rejects Feb 29 in a non-leap year", () => {
    expect(isValidIsoDate("2023-02-29")).toBe(false)
  })

  it("rejects an out-of-range month", () => {
    expect(isValidIsoDate("2024-13-01")).toBe(false)
  })

  it("rejects wrong shapes (missing zero-padding, slashes, empty)", () => {
    expect(isValidIsoDate("2024-1-1")).toBe(false)
    expect(isValidIsoDate("2024/01/01")).toBe(false)
    expect(isValidIsoDate("")).toBe(false)
  })
})
