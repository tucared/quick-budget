import type { BudgetSummary } from "@/lib/types"
import { formatCurrency, formatNumber } from "@/lib/currency"
import { getBudgetStatusTheme, getBudgetStatusIcon } from "@/lib/budget-utils"

interface CategoryBudgetStatusProps {
  budget: BudgetSummary | null
  additionalAmount?: number
  loading?: boolean
}

export function CategoryBudgetStatus({
  budget,
  additionalAmount = 0,
  loading = false
}: CategoryBudgetStatusProps) {
  if (loading) {
    return (
      <div className="p-3 bg-muted/50 rounded-md text-sm text-muted-foreground">
        Loading budget status...
      </div>
    )
  }

  if (!budget) {
    return (
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
        No budget set for this category this month
      </div>
    )
  }

  const allocated = Number(budget.allocated_amount)
  const spent = Number(budget.spent_amount)
  const remaining = Number(budget.remaining_amount)

  // Calculate impact of additional amount
  const newSpent = spent + additionalAmount
  const newRemaining = remaining - additionalAmount
  const newPercentSpent = allocated > 0 ? (newSpent / allocated) * 100 : 0

  const statusColor = getBudgetStatusTheme(newPercentSpent)
  const willOverspend = newRemaining < 0

  return (
    <div className={`p-3 rounded-md border ${statusColor.bg} ${statusColor.border}`}>
      {/* Progress bar with percentage */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${statusColor.indicator}`}
            style={{ width: `${Math.min(newPercentSpent, 100)}%` }}
          />
        </div>
        <span className={`text-xs font-semibold ${statusColor.text} flex items-center gap-1 shrink-0`}>
          <span>{getBudgetStatusIcon(newPercentSpent)}</span>
          <span>{formatNumber(newPercentSpent, 0)}%</span>
        </span>
      </div>

      {/* Budget details */}
      <div className="grid grid-cols-3 gap-2 text-xs mb-2">
        <div>
          <div className="text-muted-foreground">Allocated</div>
          <div className="font-semibold">{formatCurrency(allocated, 0)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Spent</div>
          <div className="font-semibold">{formatCurrency(spent)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Left</div>
          <div className="font-semibold">{formatCurrency(remaining)}</div>
        </div>
      </div>

      {/* Impact preview (only show if there's an amount) */}
      {additionalAmount > 0 && (
        <div className={`pt-2 border-t ${statusColor.border}`}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">After this expense:</span>
            <span className={`font-bold ${willOverspend ? 'text-red-600' : statusColor.text}`}>
              {formatCurrency(newRemaining)} left
              {willOverspend && " ⚠️"}
            </span>
          </div>
          {willOverspend && (
            <div className="mt-1 text-xs text-red-600 font-medium">
              This will exceed your budget by {formatCurrency(Math.abs(newRemaining))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
