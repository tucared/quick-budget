import { describe, it, expect, vi, afterEach } from "vitest"
import { formatCurrency, formatNumber, fetchConversionRate } from "@/lib/currency"

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

  it("places minus sign before the currency symbol for negatives", () => {
    expect(formatCurrency(-1234.56)).toBe("-€1 234,56")
  })

  it("places minus sign before symbol for non-EUR currencies too", () => {
    expect(formatCurrency(-50, 2, "BRL")).toBe("-R$50,00")
    expect(formatCurrency(-50, 2, "USD")).toBe("-$50,00")
  })

  it("handles -0 as positive (no minus sign)", () => {
    expect(formatCurrency(-0)).toBe("€0,00")
  })
})

describe("fetchConversionRate", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Stub the /api/exchange-rates route: return rate_to_eur per currency parsed
  // from the request URL. EUR short-circuits inside fetchExchangeRateFromAPI
  // without a fetch, so it never reaches here.
  function stubRates(rates: Record<string, { rate: number; source?: string }>) {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      const currency = new URL(url, "http://localhost").searchParams.get("currency") ?? ""
      const entry = rates[currency]
      if (!entry) throw new Error(`no stub for ${currency}`)
      return {
        ok: true,
        json: async () => ({ currency, date: "2026-06-15", rate: entry.rate, source: entry.source ?? "cache" }),
      } as Response
    })
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }

  it("short-circuits to rate 1 when the input is already the base currency (no fetch)", async () => {
    const fetchMock = stubRates({})
    expect(await fetchConversionRate("GBP", "GBP", "2026-06-15")).toEqual({ rate: 1, isFallback: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns rate_to_eur directly for an EUR base (single leg)", async () => {
    stubRates({ BRL: { rate: 0.16 } })
    const { rate } = await fetchConversionRate("BRL", "EUR", "2026-06-15")
    expect(rate).toBeCloseTo(0.16, 6)
  })

  it("computes a cross-rate for a non-EUR base (BRL → GBP)", async () => {
    stubRates({ BRL: { rate: 0.16 }, GBP: { rate: 1.17 } })
    const { rate } = await fetchConversionRate("BRL", "GBP", "2026-06-15")
    expect(rate).toBeCloseTo(0.16 / 1.17, 6)
  })

  it("resolves EUR as a foreign currency for a GBP base (1 / rate_to_eur(GBP))", async () => {
    stubRates({ GBP: { rate: 1.17 } })
    const { rate } = await fetchConversionRate("EUR", "GBP", "2026-06-15")
    expect(rate).toBeCloseTo(1 / 1.17, 6)
  })

  it("flags isFallback when either leg fell back", async () => {
    stubRates({ BRL: { rate: 0.16, source: "fallback" }, GBP: { rate: 1.17 } })
    expect((await fetchConversionRate("BRL", "GBP", "2026-06-15")).isFallback).toBe(true)
  })
})
