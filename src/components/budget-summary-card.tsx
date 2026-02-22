import { Card, CardContent } from "@/components/ui/card"
import type { BudgetSummary } from "@/lib/types"
import { formatCurrency, formatNumber } from "@/lib/currency"
import { getBudgetProgressBarColor, getBudgetStatusLabel, getBudgetStatusColor, getBudgetStatusTheme } from "@/lib/budget-utils"

interface BudgetSummaryCardProps {
  budgets: BudgetSummary[]
}

export function BudgetSummaryCard({ budgets }: BudgetSummaryCardProps) {
  const totalAllocated = budgets.reduce((sum, b) => sum + Number(b.allocated_amount), 0)
  const totalSpent = budgets.reduce((sum, b) => sum + Number(b.spent_amount), 0)
  const totalRemaining = totalAllocated - totalSpent
  const percentSpent = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0
  const theme = getBudgetStatusTheme(percentSpent)

  return (
    <Card className={`border-l-4 ${theme.border} ${theme.bg}`}>
      <CardContent className="pt-4 pb-4">
        {/* Hero: remaining amount */}
        <div className="mb-3">
          <div className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wide font-medium">Remaining this month</div>
          <div className={`text-3xl font-bold ${getBudgetStatusColor(percentSpent)}`}>
            {formatCurrency(totalRemaining, 0)}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-black/10 rounded-full overflow-hidden mb-2">
          <div
            className={`h-full transition-all duration-300 ${getBudgetProgressBarColor(percentSpent)}`}
            style={{ width: `${Math.min(percentSpent, 100)}%` }}
          />
        </div>

        {/* Footer row */}
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">
            {formatCurrency(totalSpent, 0)} of {formatCurrency(totalAllocated, 0)} spent · {formatNumber(percentSpent, 0)}%
          </span>
          <span className={`${getBudgetStatusColor(percentSpent)} font-medium`}>
            {getBudgetStatusLabel(percentSpent)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
