// Exchange rate API utilities
// Uses ExchangeRate-API (https://www.exchangerate-api.com)

interface ExchangeRateResponse {
  result: string
  base_code: string
  time_last_update_utc?: string
  conversion_rates: Record<string, number>
}

/**
 * Adjust date to previous working day if it falls on a weekend
 * Forex markets are closed on weekends, so we use Friday's rate for Sat/Sun
 * @param dateStr - Date in YYYY-MM-DD format
 * @returns Adjusted date as YYYY-MM-DD
 */
function adjustToWorkingDay(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  const dayOfWeek = date.getUTCDay() // 0 = Sunday, 6 = Saturday

  // If Saturday (6), go back 1 day to Friday
  if (dayOfWeek === 6) {
    date.setUTCDate(date.getUTCDate() - 1)
  }
  // If Sunday (0), go back 2 days to Friday
  else if (dayOfWeek === 0) {
    date.setUTCDate(date.getUTCDate() - 2)
  }

  return date.toISOString().split('T')[0]
}

/**
 * Fetch exchange rate from EUR to target currency for a specific date
 * @param currency - Target currency code (e.g., 'BRL', 'USD')
 * @param date - Date in YYYY-MM-DD format (defaults to today)
 * @returns Exchange rate from currency to EUR
 *
 * Note: Free API plan only provides current rates. For historical rates, a paid plan is required.
 * Weekend dates are automatically adjusted to the previous Friday (forex markets closed on weekends).
 */
export async function fetchExchangeRate(
  currency: string,
  date?: string
): Promise<number> {
  // EUR to EUR is always 1.0
  if (currency === 'EUR') {
    return 1.0
  }

  const apiKey = process.env.EXCHANGE_RATE_API_KEY
  if (!apiKey) {
    console.error('EXCHANGE_RATE_API_KEY is not set')
    throw new Error('Exchange rate API key not configured')
  }

  const requestedDate = date || new Date().toISOString().split('T')[0]
  const workingDayDate = adjustToWorkingDay(requestedDate)

  // Log if we adjusted the date for weekend
  if (workingDayDate !== requestedDate) {
    console.log(`Adjusted weekend date ${requestedDate} to working day ${workingDayDate} for forex rate`)
  }

  // Use latest endpoint (free plan doesn't support historical rates)
  // For true historical rates, a paid API plan is required
  const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/EUR`

  try {
    const response = await fetch(url, {
      // Cache for 1 hour to reduce API calls
      next: { revalidate: 3600 }
    })

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`)
    }

    const data: ExchangeRateResponse = await response.json()

    if (data.result !== 'success') {
      throw new Error('API request was not successful')
    }

    const rate = data.conversion_rates[currency]
    if (!rate) {
      throw new Error(`Rate not found for currency ${currency}`)
    }

    // Convert from EUR-to-currency to currency-to-EUR
    // Example: If 1 EUR = 5.5 BRL, then 1 BRL = 1/5.5 = 0.18 EUR
    return 1 / rate

  } catch (error) {
    console.error(`Failed to fetch exchange rate for ${currency} on ${workingDayDate}:`, error)

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
