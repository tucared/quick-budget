import { Card, CardContent } from "@/components/ui/card"
import type { BudgetSummary } from "@/lib/types"
import { formatCurrency, formatNumber } from "@/lib/currency"
import { getBudgetProgressBarColor, getBudgetStatusLabel, getBudgetStatusColor, getBudgetStatusTheme } from "@/lib/budget-utils"

interface BudgetSummaryCardProps {
  budgets: BudgetSummary[]
  target?: { amount: number; unallocated: number }
  dayOfMonth?: number
  daysInMonth?: number
  /** Net Tricount owe/owed for the month (EUR; positive = owed to you, negative = you owe). */
  tricountBalance?: number | null
}

export function BudgetSummaryCard({ budgets, target, dayOfMonth, daysInMonth, tricountBalance }: BudgetSummaryCardProps) {
  const totalAllocated = budgets.reduce((sum, b) => sum + Number(b.allocated_amount), 0)
  const totalSpent = budgets.reduce((sum, b) => sum + Number(b.spent_amount), 0)
  const paceBaseline = target ? target.amount : totalAllocated
  const totalRemaining = paceBaseline - totalSpent
  const percentSpent = paceBaseline > 0 ? (totalSpent / paceBaseline) * 100 : 0
  const theme = getBudgetStatusTheme(percentSpent, dayOfMonth, daysInMonth, totalRemaining)

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
          </span>
          <span className={`${getBudgetStatusColor(percentSpent, dayOfMonth, daysInMonth, totalRemaining)} font-medium`}>
            {getBudgetStatusLabel(percentSpent, dayOfMonth, daysInMonth, totalRemaining)}
          </span>
        </div>

        {/* Tricount owe/owed reconciliation memo (cashflow adjustment for the month) */}
        {tricountBalance != null && Math.abs(tricountBalance) >= 0.005 && (
          <div className="mt-2 pt-2 border-t border-border/60 text-xs text-muted-foreground">
            Tricount:{" "}
            <span className="text-foreground font-medium">
              {tricountBalance < 0
                ? `you owe ${formatCurrency(Math.abs(tricountBalance))}`
                : `you're owed ${formatCurrency(tricountBalance)}`}
            </span>{" "}
            this month
          </div>
        )}

      </CardContent>
    </Card>
  )
}
