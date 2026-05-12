import { describe, it, expect } from "vitest"
import { formatCurrency, formatNumber } from "@/lib/currency"

describe("formatNumber", () => {
  it("formats positive integer with default 2 decimals", () => {
    expect(formatNumber(1234)).toBe("1 234,00")
  })

  it("formats zero", () => {
    expect(formatNumber(0)).toBe("0,00")
  })

  it("formats negative number", () => {
    expect(formatNumber(-1234.56)).toBe("-1 234,56")
  })

  it("formats negative integer", () => {
    expect(formatNumber(-123)).toBe("-123,00")
  })

  it("formats large number with multiple thousand separators", () => {
    expect(formatNumber(1234567.89)).toBe("1 234 567,89")
  })

  it("formats large negative number", () => {
    expect(formatNumber(-1234567.89)).toBe("-1 234 567,89")
  })

  it("formats with decimals=0 (no comma, no decimal part)", () => {
    expect(formatNumber(1234.56, 0)).toBe("1 235")
  })

  it("formats with decimals=4", () => {
    expect(formatNumber(0.5, 4)).toBe("0,5000")
  })

  it("formats sub-thousand value without separator", () => {
    expect(formatNumber(99.5)).toBe("99,50")
  })
})

describe("formatCurrency", () => {
  it("prefixes EUR with € by default", () => {
    expect(formatCurrency(1234.56)).toBe("€1 234,56")
  })

  it("prefixes BRL with R$", () => {
    expect(formatCurrency(1234.56, 2, "BRL")).toBe("R$1 234,56")
  })

  it("prefixes USD with $", () => {
    expect(formatCurrency(1234.56, 2, "USD")).toBe("$1 234,56")
  })

  it("prefixes GBP with £", () => {
    expect(formatCurrency(1234.56, 2, "GBP")).toBe("£1 234,56")
  })

  it("falls back to the currency code itself for unknown codes", () => {
    expect(formatCurrency(1234.56, 2, "CHF")).toBe("CHF1 234,56")
  })

  it("respects custom decimals", () => {
    expect(formatCurrency(1234.56, 0)).toBe("€1 235")
  })

  it("handles zero", () => {
    expect(formatCurrency(0)).toBe("€0,00")
  })

  it("handles negative amounts", () => {
    expect(formatCurrency(-1234.56)).toBe("€-1 234,56")
  })
})
