// Date utilities to ensure consistent handling across timezones

/**
 * Gets the first day of the current month in the user's local timezone
 * Returns as YYYY-MM-DD string for database storage
 */
export function getCurrentBudgetMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}-01`
}

/**
 * Formats a Date object to YYYY-MM-DD string in local timezone
 * Ensures dates are stored consistently regardless of timezone
 */
export function formatDateForDB(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Gets today's date as YYYY-MM-DD string in local timezone
 */
export function getTodayDateString(): string {
  return formatDateForDB(new Date())
}

/**
 * Parses a YYYY-MM-DD string to a Date object
 * Sets time to midnight in local timezone
 */
export function parseDateString(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number)
  return new Date(year, month - 1, day)
}
