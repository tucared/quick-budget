import { Card, CardContent } from "@/components/ui/card"
import type { BudgetSummary } from "@/lib/types"
import { formatCurrency, formatNumber } from "@/lib/currency"
import { getBudgetStatusColor, getBudgetProgressBarColor, getBudgetStatusIcon, getBudgetStatusLabel } from "@/lib/budget-utils"

interface BudgetCategoryCardProps {
  budget: BudgetSummary
}

export function BudgetCategoryCard({ budget }: BudgetCategoryCardProps) {
  const percentSpent = Number(budget.percent_spent)
  const allocated = Number(budget.allocated_amount)
  const spent = Number(budget.spent_amount)
  const remaining = Number(budget.remaining_amount)

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        {/* Category header with icon and name */}
        <div className="flex items-center gap-2 mb-3">
          {budget.category_icon && (
            <span className="text-2xl">{budget.category_icon}</span>
          )}
          <h3 className="font-semibold text-base flex-1">{budget.category_name}</h3>
          <span className={`text-sm font-medium ${getBudgetStatusColor(percentSpent)} flex items-center gap-1`}>
            <span>{getBudgetStatusIcon(percentSpent)}</span>
            <span>{formatNumber(percentSpent, 0)} %</span>
          </span>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${getBudgetProgressBarColor(percentSpent)}`}
              style={{ width: `${Math.min(percentSpent, 100)}%` }}
            />
          </div>
        </div>

        {/* Amount details */}
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Allocated</div>
            <div className="font-semibold">{formatCurrency(allocated, 0)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Spent</div>
            <div className="font-semibold">{formatCurrency(spent)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Left</div>
            <div className={`font-semibold ${getBudgetStatusColor(percentSpent)}`}>
              {formatCurrency(remaining)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
