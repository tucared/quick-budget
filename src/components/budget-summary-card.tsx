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
  // Actual cash that left the wallet: budget "spent" (share-based) plus the
  // Tricount cash-flow adjustment (what was actually paid, income netted in).
  // Shown only when Tricount activity makes it differ from "spent".
  const showCashflow = cashflowAdjustment != null && Math.abs(cashflowAdjustment) >= 0.005
  const cashOut = totalSpent + (cashflowAdjustment ?? 0)

  return (
    <Card className={`border-l-4 ${theme.border} ${theme.bg}`}>
      <CardContent className="pt-4 pb-4">
        {/* Hero: remaining amount */}
        <div className="mb-3">
          <div className="text-xs text-muted-foreground mb-0.5 font-medium">Remaining this month</div>
          <div className={`text-3xl font-bold ${getBudgetStatusColor(percentSpent, dayOfMonth, daysInMonth, totalRemaining)}`}>
            {formatCurrency(totalRemaining)}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden mb-2">
          <div
            className={`h-full transition-all duration-300 ${getBudgetProgressBarColor(percentSpent, dayOfMonth, daysInMonth, totalRemaining)}`}
            style={{ width: `${Math.min(percentSpent, 100)}%` }}
          />
        </div>

        {/* Footer row */}
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">
            {formatCurrency(totalSpent)} of {formatCurrency(paceBaseline)} spent · {formatNumber(percentSpent, 0)}%{target ? " of target" : ""}
            {showCashflow && (
              <>
                {" · "}
                <span
                  className="text-foreground"
                  title="Actual cash that left the wallet this month (Tricount share replaced by what you paid, income netted in)"
                >
                  {formatCurrency(cashOut)} cash out
                </span>
              </>
            )}
          </span>
          <span className={`${getBudgetStatusColor(percentSpent, dayOfMonth, daysInMonth, totalRemaining)} font-medium`}>
            {getBudgetStatusLabel(percentSpent, dayOfMonth, daysInMonth, totalRemaining)}
          </span>
        </div>

      </CardContent>
    </Card>
  )
}
