import type { BudgetSummary } from "@/lib/types"
import { formatCurrency, formatNumber } from "@/lib/currency"
import { getBudgetStatusTheme } from "@/lib/budget-utils"

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
      <div className="px-2.5 py-2 bg-muted/50 rounded-md text-xs text-muted-foreground">
        Loading budget status...
      </div>
    )
  }

  if (!budget) {
    return (
      <div className="px-2.5 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
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
  const currentPercent = allocated > 0 ? (spent / allocated) * 100 : 0
  const additionalPercent = allocated > 0 ? (additionalAmount / allocated) * 100 : 0
  const newPercentSpent = allocated > 0 ? (newSpent / allocated) * 100 : 0

  const statusColor = getBudgetStatusTheme(newPercentSpent)
  const willOverspend = newRemaining < 0

  return (
    <div className={`px-2.5 py-2 rounded-md border ${statusColor.bg} ${statusColor.border}`}>
      {/* Progress bar: solid = current spent, lighter = this expense */}
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden flex">
          <div
            className={`h-full transition-all duration-300 ${statusColor.indicator}`}
            style={{ width: `${Math.min(currentPercent, 100)}%` }}
          />
          {additionalAmount > 0 && (
            <div
              className={`h-full transition-all duration-300 ${statusColor.indicator} opacity-50`}
              style={{ width: `${Math.min(additionalPercent, 100 - Math.min(currentPercent, 100))}%` }}
            />
          )}
        </div>
        <span className={`text-xs font-semibold ${statusColor.text} flex items-center gap-1 shrink-0`}>
          <span>{"●"}</span>
          <span>{formatNumber(newPercentSpent, 0)}%</span>
        </span>
      </div>

      {/* Budget details - single compact row */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {formatCurrency(spent)} <span className="mx-0.5">/</span> {formatCurrency(allocated, 0)}
        </span>
        <span className="font-semibold">
          {formatCurrency(remaining)} left
        </span>
      </div>

      {/* Impact preview (only show if there's an amount) */}
      {additionalAmount > 0 && (
        <div className={`mt-1.5 pt-1.5 border-t ${statusColor.border}`}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">After this expense:</span>
            <span className={`font-bold ${willOverspend ? 'text-red-600' : statusColor.text}`}>
              {formatCurrency(newRemaining)} left
              {willOverspend && " ⚠️"}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
