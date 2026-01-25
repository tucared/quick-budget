import type { BudgetSummary } from "@/lib/types"
import { formatCurrency, formatNumber } from "@/lib/currency"

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

  // Determine status colors
  const getStatusColor = (percentSpent: number) => {
    if (percentSpent >= 100) return { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", indicator: "bg-red-500" }
    if (percentSpent >= 95) return { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-800", indicator: "bg-orange-500" }
    if (percentSpent >= 75) return { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-800", indicator: "bg-yellow-500" }
    return { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", indicator: "bg-green-500" }
  }

  const statusColor = getStatusColor(newPercentSpent)
  const willOverspend = newRemaining < 0

  return (
    <div className={`p-3 rounded-md border ${statusColor.bg} ${statusColor.border}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {budget.category_icon && (
            <span className="text-lg">{budget.category_icon}</span>
          )}
          <span className="font-medium text-sm">{budget.category_name}</span>
        </div>
        <span className={`text-xs font-semibold ${statusColor.text}`}>
          {formatNumber(newPercentSpent, 0)} %
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${statusColor.indicator}`}
            style={{ width: `${Math.min(newPercentSpent, 100)}%` }}
          />
        </div>
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
