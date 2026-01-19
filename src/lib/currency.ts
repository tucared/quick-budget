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
