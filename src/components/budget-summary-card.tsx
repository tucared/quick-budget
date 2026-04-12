import { Card, CardContent } from "@/components/ui/card"
import type { BudgetSummary } from "@/lib/types"
import { formatCurrency, formatNumber } from "@/lib/currency"
import { getBudgetProgressBarColor, getBudgetStatusLabel, getBudgetStatusColor, getBudgetStatusTheme } from "@/lib/budget-utils"

interface BudgetSummaryCardProps {
  budgets: BudgetSummary[]
  target?: { amount: number; unallocated: number }
  dayOfMonth?: number
  daysInMonth?: number
}

export function BudgetSummaryCard({ budgets, target, dayOfMonth, daysInMonth }: BudgetSummaryCardProps) {
  const totalAllocated = budgets.reduce((sum, b) => sum + Number(b.allocated_amount), 0)
  const totalSpent = budgets.reduce((sum, b) => sum + Number(b.spent_amount), 0)
  const totalRemaining = totalAllocated - totalSpent
  const percentSpent = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0
  const theme = getBudgetStatusTheme(percentSpent, dayOfMonth, daysInMonth, totalRemaining)
  const overTarget = target ? target.unallocated < 0 : false

  return (
    <Card className={`border-l-4 ${theme.border} ${theme.bg}`}>
      <CardContent className="pt-4 pb-4">
        {/* Hero: remaining amount */}
        <div className="mb-3">
          <div className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wide font-medium">Remaining this month</div>
          <div className={`text-3xl font-bold ${getBudgetStatusColor(percentSpent, dayOfMonth, daysInMonth, totalRemaining)}`}>
            {formatCurrency(totalRemaining, 0)}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-black/10 rounded-full overflow-hidden mb-2">
          <div
            className={`h-full transition-all duration-300 ${getBudgetProgressBarColor(percentSpent, dayOfMonth, daysInMonth, totalRemaining)}`}
            style={{ width: `${Math.min(percentSpent, 100)}%` }}
          />
        </div>

        {/* Footer row */}
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">
            {formatCurrency(totalSpent, 0)} of {formatCurrency(totalAllocated, 0)} spent · {formatNumber(percentSpent, 0)}%
          </span>
          <span className={`${getBudgetStatusColor(percentSpent, dayOfMonth, daysInMonth, totalRemaining)} font-medium`}>
            {getBudgetStatusLabel(percentSpent, dayOfMonth, daysInMonth, totalRemaining)}
          </span>
        </div>

        {target && (
          <div className="mt-2 pt-2 border-t border-black/10 flex justify-between items-center text-xs">
            <span className={overTarget ? "text-red-600 font-medium" : "text-muted-foreground"}>
              {overTarget
                ? `Over target by ${formatCurrency(-target.unallocated, 0)}`
                : `Unallocated ${formatCurrency(target.unallocated, 0)}`}
            </span>
            <span className="text-muted-foreground">
              Target {formatCurrency(target.amount, 0)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
