// Currency conversion utilities

// Exchange rates to EUR (base currency)
// These would ideally come from an API, but hardcoded for now
const EXCHANGE_RATES_TO_EUR: Record<string, number> = {
  EUR: 1.0,
  BRL: 0.17, // 1 BRL = ~0.17 EUR
}

export function convertToEUR(amount: number, fromCurrency: string): number {
  const rate = EXCHANGE_RATES_TO_EUR[fromCurrency]
  if (!rate) {
    console.warn(`Exchange rate not found for ${fromCurrency}, using 1.0`)
    return amount
  }
  return amount * rate
}

export function getExchangeRate(fromCurrency: string, toCurrency: string = "EUR"): number {
  if (fromCurrency === toCurrency) return 1.0

  const rate = EXCHANGE_RATES_TO_EUR[fromCurrency]
  if (!rate) {
    console.warn(`Exchange rate not found for ${fromCurrency}, using 1.0`)
    return 1.0
  }

  return rate
}

// European number formatting utilities
// Format: €120 000,99 (space as thousands separator, comma as decimal separator)

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
 * @returns Formatted currency string (e.g., "€120 000,99")
 */
export function formatCurrency(value: number, decimals: number = 2): string {
  return `€${formatNumber(value, decimals)}`
}
