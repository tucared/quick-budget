// Exchange rate API utilities
// Uses Frankfurter (https://www.frankfurter.dev) — free, no API key, ECB data

interface FrankfurterResponse {
  base: string
  date: string
  rates: Record<string, number>
}

/**
 * Adjust date to previous working day if it falls on a weekend
 * ECB doesn't publish rates on weekends; Frankfurter follows the same convention.
 * @param dateStr - Date in YYYY-MM-DD format
 * @returns Adjusted date as YYYY-MM-DD
 */
export function adjustToWorkingDay(dateStr: string): string {
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
 * Fetch exchange rate from EUR to target currency for a specific date.
 * Uses Frankfurter API (ECB data, real historical rates, no API key needed).
 *
 * @internal Server-side only — used by the /api/exchange-rates route.
 * Client code should use {@link fetchExchangeRateFromAPI} from `@/lib/currency`.
 *
 * @param currency - Target currency code (e.g., 'BRL', 'USD')
 * @param date - Date in YYYY-MM-DD format (defaults to today)
 * @returns rate_to_eur: how many EUR per 1 unit of currency
 * @throws on network failure or invalid response (caller should handle fallback)
 */
export async function fetchExchangeRate(
  currency: string,
  date?: string
): Promise<number> {
  // EUR to EUR is always 1.0
  if (currency === 'EUR') {
    return 1.0
  }

  const requestedDate = date || new Date().toISOString().split('T')[0]
  const workingDayDate = adjustToWorkingDay(requestedDate)

  const url = `https://api.frankfurter.dev/v1/${workingDayDate}?base=EUR&symbols=${currency}`

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Frankfurter API responded with status ${response.status}`)
  }

  const data: FrankfurterResponse = await response.json()

  const eurToCurrency = data.rates[currency]
  if (!eurToCurrency) {
    throw new Error(`Rate not found for currency ${currency} on ${workingDayDate}`)
  }

  // Convert from EUR-to-currency to currency-to-EUR
  // Example: If 1 EUR = 6.1 BRL, then 1 BRL = 1/6.1 ≈ 0.164 EUR
  return 1 / eurToCurrency
}
