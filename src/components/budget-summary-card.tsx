import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { BudgetSummary } from "@/lib/types"
import { formatCurrency, formatNumber } from "@/lib/currency"
import { getBudgetStatusColor, getBudgetProgressBarColor, getBudgetStatusLabel } from "@/lib/budget-utils"

interface BudgetSummaryCardProps {
  budgets: BudgetSummary[]
}

export function BudgetSummaryCard({ budgets }: BudgetSummaryCardProps) {
  const totalAllocated = budgets.reduce((sum, b) => sum + Number(b.allocated_amount), 0)
  const totalSpent = budgets.reduce((sum, b) => sum + Number(b.spent_amount), 0)
  const totalRemaining = totalAllocated - totalSpent
  const percentSpent = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0

  return (
    <Card className="border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Total Budget</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {/* Amount grid */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Allocated</div>
              <div className="text-lg font-semibold">{formatCurrency(totalAllocated, 0)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Spent</div>
              <div className="text-lg font-semibold">{formatCurrency(totalSpent, 0)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Remaining</div>
              <div className={`text-lg font-semibold ${getBudgetStatusColor(percentSpent)}`}>
                {formatCurrency(totalRemaining, 0)}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${getBudgetProgressBarColor(percentSpent)}`}
                style={{ width: `${Math.min(percentSpent, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {formatNumber(percentSpent, 0)} % spent
              </span>
              <span className={`${getBudgetStatusColor(percentSpent)} font-medium`}>
                {getBudgetStatusLabel(percentSpent)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
