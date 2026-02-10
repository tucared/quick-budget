// Exchange rate API utilities
// Uses exchangerate.host (free, no API key required)

interface ExchangeRateResponse {
  success: boolean
  base: string
  date: string
  rates: Record<string, number>
}

/**
 * Fetch exchange rate from EUR to target currency for a specific date
 * @param currency - Target currency code (e.g., 'BRL', 'USD')
 * @param date - Date in YYYY-MM-DD format (defaults to today)
 * @returns Exchange rate from EUR to target currency
 */
export async function fetchExchangeRate(
  currency: string,
  date?: string
): Promise<number> {
  // EUR to EUR is always 1.0
  if (currency === 'EUR') {
    return 1.0
  }

  const formattedDate = date || new Date().toISOString().split('T')[0]
  const url = `https://api.exchangerate.host/${formattedDate}?base=EUR&symbols=${currency}`

  try {
    const response = await fetch(url, {
      // Cache for 1 hour to reduce API calls
      next: { revalidate: 3600 }
    })

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`)
    }

    const data: ExchangeRateResponse = await response.json()

    if (!data.success) {
      throw new Error('API request was not successful')
    }

    const rate = data.rates[currency]
    if (!rate) {
      throw new Error(`Rate not found for currency ${currency}`)
    }

    // Convert from EUR-to-currency to currency-to-EUR
    // Example: If 1 EUR = 5.5 BRL, then 1 BRL = 1/5.5 = 0.18 EUR
    return 1 / rate

  } catch (error) {
    console.error(`Failed to fetch exchange rate for ${currency} on ${formattedDate}:`, error)

    // Fall back to hardcoded rates for common currencies
    const fallbackRates: Record<string, number> = {
      BRL: 0.17,  // 1 BRL ≈ 0.17 EUR
      USD: 0.92,  // 1 USD ≈ 0.92 EUR
      GBP: 1.17,  // 1 GBP ≈ 1.17 EUR
      CHF: 1.05,  // 1 CHF ≈ 1.05 EUR
      JPY: 0.0062, // 1 JPY ≈ 0.0062 EUR
      CAD: 0.65,  // 1 CAD ≈ 0.65 EUR
    }

    if (fallbackRates[currency]) {
      console.warn(`Using fallback rate for ${currency}`)
      return fallbackRates[currency]
    }

    // Last resort: assume 1:1
    console.warn(`No fallback rate found for ${currency}, using 1.0`)
    return 1.0
  }
}

/**
 * Fetch multiple exchange rates for a date range
 * Useful for seeding historical data
 */
export async function fetchExchangeRatesForDateRange(
  currency: string,
  startDate: string,
  endDate: string
): Promise<Array<{ date: string; rate: number }>> {
  const rates: Array<{ date: string; rate: number }> = []
  const start = new Date(startDate)
  const end = new Date(endDate)

  // Fetch rates day by day (could be optimized with batch API if available)
  const currentDate = new Date(start)
  while (currentDate <= end) {
    const dateStr = currentDate.toISOString().split('T')[0]
    try {
      const rate = await fetchExchangeRate(currency, dateStr)
      rates.push({ date: dateStr, rate })

      // Add small delay to avoid rate limiting (100ms between requests)
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (error) {
      console.error(`Failed to fetch rate for ${dateStr}:`, error)
    }

    currentDate.setDate(currentDate.getDate() + 1)
  }

  return rates
}
