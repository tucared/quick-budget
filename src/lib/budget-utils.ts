import { getDaysInMonth } from "date-fns"
import type { BudgetSummary, Expense } from "@/lib/types"
import { parseLocalDate } from "@/lib/date-utils"

/**
 * Partition budget_summary rows into budgets vs allowances by the
 * `exclude_from_budget_total` flag (allowances are excluded from the
 * household budget total). Shared by the server and client data fetchers so the
 * single budget_summary query can be split the same way in both places.
 */
export function partitionBudgetSummary(rows: BudgetSummary[]): {
  budgets: BudgetSummary[]
  allowances: BudgetSummary[]
} {
  const budgets: BudgetSummary[] = []
  const allowances: BudgetSummary[] = []
  for (const row of rows) {
    if (row.exclude_from_budget_total) allowances.push(row)
    else budgets.push(row)
  }
  return { budgets, allowances }
}

/** Minimal tricount_entry_map shape needed for the cashflow adjustment. */
type CashflowRow = {
  paid_converted_amount: number | string
  share_converted_amount: number | string
  expense_id: string | null
}

/**
 * Base-currency adjustment that turns the budget's share-based "spent" into the
 * month's actual cash flow: per reconciled entry, `paid − share` for mirrored
 * expenses (expense_id set, in the budget total at their share) and `paid` for
 * income (expense_id null, not in the total, so only its cash counts). The
 * ledger's `*_converted_amount` columns are already denominated in the
 * household base currency. Summed in integer cents to avoid float drift, then
 * converted back to whole units. Returns null for an empty input (no reconciled
 * entries) so the figure can be hidden.
 */
export function tricountCashflowAdjustment(rows: CashflowRow[]): number | null {
  if (rows.length === 0) return null
  const cents = rows.reduce((sum, r) => {
    const consumed = r.expense_id ? Number(r.share_converted_amount) : 0
    return sum + Math.round((Number(r.paid_converted_amount) - consumed) * 100)
  }, 0)
  return cents / 100
}

type BudgetStatus = "over" | "fully_used" | "critical" | "ahead" | "warning" | "on_track"

function getBudgetStatus(percentSpent: number, dayOfMonth?: number, daysInMonth?: number, remainingAmount?: number): BudgetStatus {
  if (remainingAmount != null && Math.abs(remainingAmount) < 0.005) return "fully_used"
  if (percentSpent >= 100) return "over"
  if (percentSpent >= 95) return "critical"
  if (dayOfMonth != null && daysInMonth != null) {
    const idealPercent = (dayOfMonth / daysInMonth) * 100
    if (percentSpent > idealPercent * 1.1) return "ahead"
  }
  if (percentSpent >= 75) return "warning"
  return "on_track"
}

const statusTextColors: Record<BudgetStatus, string> = {
  over: "text-[hsl(4,60%,44%)]",
  fully_used: "text-muted-foreground",
  critical: "text-[hsl(4,60%,44%)]",
  ahead: "text-[hsl(24,85%,42%)]",
  warning: "text-[hsl(24,85%,42%)]",
  on_track: "text-[hsl(160,40%,35%)]",
}

export function getBudgetStatusColor(percentSpent: number, dayOfMonth?: number, daysInMonth?: number, remainingAmount?: number): string {
  return statusTextColors[getBudgetStatus(percentSpent, dayOfMonth, daysInMonth, remainingAmount)]
}

const progressBarColors: Record<BudgetStatus, string> = {
  over: "bg-[hsl(4,60%,44%)]",
  fully_used: "bg-[hsl(30,5%,65%)]",
  critical: "bg-[hsl(4,60%,44%)]",
  ahead: "bg-[hsl(24,85%,42%)]",
  warning: "bg-[hsl(24,85%,42%)]",
  on_track: "bg-[hsl(160,40%,35%)]",
}

export function getBudgetProgressBarColor(percentSpent: number, dayOfMonth?: number, daysInMonth?: number, remainingAmount?: number): string {
  return progressBarColors[getBudgetStatus(percentSpent, dayOfMonth, daysInMonth, remainingAmount)]
}

const statusLabels: Record<BudgetStatus, string> = {
  over: "Overspent",
  fully_used: "Fully used",
  critical: "Nearly exhausted",
  ahead: "Above pace",
  warning: "Almost there",
  on_track: "On track",
}

export function getBudgetStatusLabel(percentSpent: number, dayOfMonth?: number, daysInMonth?: number, remainingAmount?: number): string {
  return statusLabels[getBudgetStatus(percentSpent, dayOfMonth, daysInMonth, remainingAmount)]
}

export interface BudgetStatusTheme {
  bg: string
  border: string
  text: string
  indicator: string
}

const statusThemes: Record<BudgetStatus, BudgetStatusTheme> = {
  over: { bg: "bg-[hsl(4,40%,96%)]", border: "border-[hsl(4,40%,80%)]", text: "text-[hsl(4,60%,44%)]", indicator: "bg-[hsl(4,60%,44%)]" },
  fully_used: { bg: "bg-secondary", border: "border-border", text: "text-muted-foreground", indicator: "bg-[hsl(30,5%,65%)]" },
  critical: { bg: "bg-[hsl(20,40%,95%)]", border: "border-[hsl(20,40%,80%)]", text: "text-[hsl(4,60%,44%)]", indicator: "bg-[hsl(4,60%,44%)]" },
  ahead: { bg: "bg-[hsl(36,40%,94%)]", border: "border-[hsl(36,30%,78%)]", text: "text-[hsl(24,85%,42%)]", indicator: "bg-[hsl(24,85%,42%)]" },
  warning: { bg: "bg-[hsl(36,40%,94%)]", border: "border-[hsl(36,30%,78%)]", text: "text-[hsl(24,85%,42%)]", indicator: "bg-[hsl(24,85%,42%)]" },
  on_track: { bg: "bg-[hsl(160,25%,95%)]", border: "border-[hsl(160,20%,80%)]", text: "text-[hsl(160,40%,35%)]", indicator: "bg-[hsl(160,40%,35%)]" },
}

export function getBudgetStatusTheme(percentSpent: number, dayOfMonth?: number, daysInMonth?: number, remainingAmount?: number): BudgetStatusTheme {
  return statusThemes[getBudgetStatus(percentSpent, dayOfMonth, daysInMonth, remainingAmount)]
}

export interface DailySpendingPoint {
  dateKey: string
  total: number
}

export function computeDailySpending(expenses: Expense[], budgetMonth: string): DailySpendingPoint[] {
  const monthStart = parseLocalDate(budgetMonth)
  const daysInMonth = getDaysInMonth(monthStart)
  const monthPrefix = budgetMonth.slice(0, 7)

  const totals = new Map<string, number>()
  for (const exp of expenses) {
    if (!exp.expense_date.startsWith(monthPrefix)) continue
    totals.set(exp.expense_date, (totals.get(exp.expense_date) ?? 0) + exp.converted_amount)
  }

  const points: DailySpendingPoint[] = []
  const year = monthStart.getFullYear()
  const month = String(monthStart.getMonth() + 1).padStart(2, "0")
  for (let day = 1; day <= daysInMonth; day++) {
    const dd = String(day).padStart(2, "0")
    const dateKey = `${year}-${month}-${dd}`
    points.push({
      dateKey,
      total: totals.get(dateKey) ?? 0,
    })
  }
  return points
}

