// Timezone-safe helpers for working with "yyyy-MM-dd" calendar-date strings.
//
// Avoid `parseISO("2026-05-01")` and `new Date("2026-05-01")` for date-only
// strings: both return UTC midnight, which is the previous day in local time
// for users west of UTC. Subsequent .getMonth()/format()/startOfMonth() calls
// then operate in local time and read back the wrong month.

/**
 * Parse a "yyyy-MM-dd" string into a Date at LOCAL midnight on that calendar
 * date — safe to pass to date-fns format/getDaysInMonth/isToday/etc.
 */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Given a "yyyy-MM-01" budget-month string, return the first day of the
 * following month as "yyyy-MM-01". Pure string arithmetic — no Date object,
 * no timezone exposure.
 */
export function nextMonthString(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`
}

/**
 * Extract the "yyyy-MM" prefix from any "yyyy-MM-dd" string. Use with
 * `expense.expense_date.startsWith(monthPrefix(budgetMonth))` to filter rows
 * by month without parsing dates at all.
 */
export function monthPrefix(dateStr: string): string {
  return dateStr.slice(0, 7)
}
