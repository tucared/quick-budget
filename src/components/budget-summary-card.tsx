import { Card, CardContent } from "@/components/ui/card"
import type { BudgetSummary } from "@/lib/types"
import { formatCurrency, formatNumber } from "@/lib/currency"
import { getBudgetProgressBarColor, getBudgetStatusLabel, getBudgetStatusColor, getBudgetStatusTheme } from "@/lib/budget-utils"

interface BudgetSummaryCardProps {
  budgets: BudgetSummary[]
  target?: { amount: number; unallocated: number }
  dayOfMonth?: number
  daysInMonth?: number
  /** EUR delta from budget "spent" to actual cash flow (Tricount), or null when none. */
  cashflowAdjustment?: number | null
}

export function BudgetSummaryCard({ budgets, target, dayOfMonth, daysInMonth, cashflowAdjustment }: BudgetSummaryCardProps) {
  const totalAllocated = budgets.reduce((sum, b) => sum + Number(b.allocated_amount), 0)
  const totalSpent = budgets.reduce((sum, b) => sum + Number(b.spent_amount), 0)
  const paceBaseline = target ? target.amount : totalAllocated
  const totalRemaining = paceBaseline - totalSpent
  const percentSpent = paceBaseline > 0 ? (totalSpent / paceBaseline) * 100 : 0
  const theme = getBudgetStatusTheme(percentSpent, dayOfMonth, daysInMonth, totalRemaining)
  const statusColor = getBudgetStatusColor(percentSpent, dayOfMonth, daysInMonth, totalRemaining)
  // Actual cash that left the wallet: budget "spent" (share-based) plus the
  // Tricount cash-flow adjustment (what was actually paid, income netted in).
  // Shown only when Tricount activity makes it differ from spent.
  const showCashflow = cashflowAdjustment != null && Math.abs(cashflowAdjustment) >= 0.005
  const cashOut = totalSpent + (cashflowAdjustment ?? 0)

  return (
    <Card className={`border-l-4 ${theme.border} ${theme.bg}`}>
      <CardContent className="pt-4 pb-4">
        {/* Hero: remaining amount, with the pace status lifted to the top-right */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground mb-0.5 font-medium">Remaining this month</div>
            <div className={`text-3xl font-bold ${statusColor}`}>
              {formatCurrency(totalRemaining)}
            </div>
          </div>
          <span className={`shrink-0 text-xs font-medium ${statusColor}`}>
            {getBudgetStatusLabel(percentSpent, dayOfMonth, daysInMonth, totalRemaining)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden mb-2">
          <div
            className={`h-full transition-all duration-300 ${getBudgetProgressBarColor(percentSpent, dayOfMonth, daysInMonth, totalRemaining)}`}
            style={{ width: `${Math.min(percentSpent, 100)}%` }}
          />
        </div>

        {/* Footer: spent line on the left, actual cash out on the right */}
        <div className="flex justify-between items-center text-xs gap-3">
          <span className="text-muted-foreground">
            {showCashflow ? (
              <>{formatCurrency(totalSpent)} / {formatCurrency(paceBaseline)} · {formatNumber(percentSpent, 0)}%</>
            ) : (
              <>{formatCurrency(totalSpent)} of {formatCurrency(paceBaseline)} spent · {formatNumber(percentSpent, 0)}%{target ? " of target" : ""}</>
            )}
          </span>
          {showCashflow && (
            <span
              className="shrink-0 text-muted-foreground"
              title="Actual cash that left the wallet this month (Tricount share replaced by what you paid, income netted in)"
            >
              <span className="text-foreground font-medium">{formatCurrency(cashOut)}</span> cash out
            </span>
          )}
        </div>

      </CardContent>
    </Card>
  )
}
