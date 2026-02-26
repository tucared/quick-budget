// Currency conversion utilities

export const FALLBACK_RATES_TO_EUR: Record<string, number> = {
  EUR: 1.0,
  BRL: 0.17, // 1 BRL ≈ 0.17 EUR (fallback only)
  USD: 0.92, // 1 USD ≈ 0.92 EUR (fallback only)
  GBP: 1.17, // 1 GBP ≈ 1.17 EUR (fallback only)
  CHF: 1.05, // 1 CHF ≈ 1.05 EUR (fallback only)
  JPY: 0.0062, // 1 JPY ≈ 0.0062 EUR (fallback only)
  CAD: 0.65, // 1 CAD ≈ 0.65 EUR (fallback only)
}

interface ExchangeRateResponse {
  currency: string
  date: string
  rate: number
  source: 'cache' | 'api' | 'fixed'
  cachedAt?: string
}

/**
 * Fetch exchange rate from API (with database caching)
 * This is the recommended way to get exchange rates
 */
export async function fetchExchangeRateFromAPI(
  currency: string,
  date?: string
): Promise<number> {
  if (currency === 'EUR') {
    return 1.0
  }

  const dateParam = date || new Date().toISOString().split('T')[0]
  const url = `/api/exchange-rates?currency=${currency}&date=${dateParam}`

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`)
    }

    const data: ExchangeRateResponse = await response.json()
    return data.rate
  } catch (error) {
    console.error('Failed to fetch exchange rate from API:', error)
    // Fall back to hardcoded rate
    return FALLBACK_RATES_TO_EUR[currency] || 1.0
  }
}

// European number formatting utilities
// Format: €120 000,99 (space as thousands separator, comma as decimal separator)

// Currency symbol mapping
const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  BRL: 'R$',
}

/**
 * Format a number with European style (space as thousands separator, comma as decimal)
 * @param value - The number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted number string (e.g., "120 000,99")
 */
export function formatNumber(value: number, decimals: number = 2): string {
  const parts = value.toFixed(decimals).split('.')
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const decimalPart = parts[1]
  return decimals > 0 ? `${integerPart},${decimalPart}` : integerPart
}

/**
 * Format a currency amount with European style
 * @param value - The amount to format
 * @param decimals - Number of decimal places (default: 2)
 * @param currency - The currency code (default: 'EUR')
 * @returns Formatted currency string (e.g., "€120 000,99" or "$120 000,99")
 */
export function formatCurrency(
  value: number,
  decimals: number = 2,
  currency: string = 'EUR'
): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency
  return `${symbol}${formatNumber(value, decimals)}`
}
