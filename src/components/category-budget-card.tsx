import { Plus } from "lucide-react"
import type { BudgetSummary } from "@/lib/types"
import { formatCurrency, formatNumber } from "@/lib/currency"
import { getBudgetStatusTheme } from "@/lib/budget-utils"

interface CategoryBudgetCardProps {
  budget: BudgetSummary | null
  showHeader?: boolean
  isCurrentMonth?: boolean
  dayOfMonth?: number
  daysInMonth?: number
  onClick?: () => void
  onAddFunds?: (e: React.MouseEvent) => void
  additionalAmount?: number
  loading?: boolean
}

export function CategoryBudgetCard({
  budget,
  showHeader = false,
  isCurrentMonth = false,
  dayOfMonth,
  daysInMonth,
  onClick,
  onAddFunds,
  additionalAmount = 0,
  loading = false,
}: CategoryBudgetCardProps) {
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

  const newSpent = spent + additionalAmount
  const newRemaining = remaining - additionalAmount
  const currentPercent = allocated > 0 ? (spent / allocated) * 100 : 0
  const additionalPercent = allocated > 0 ? (additionalAmount / allocated) * 100 : 0
  const newPercentSpent = allocated > 0 ? (newSpent / allocated) * 100 : 0

  const statusColor = getBudgetStatusTheme(newPercentSpent, dayOfMonth, daysInMonth, newRemaining)
  const willOverspend = newRemaining < 0

  // Daily budget remaining: only show for current month with days left
  const daysLeft = isCurrentMonth && daysInMonth != null && dayOfMonth != null
    ? daysInMonth - dayOfMonth
    : null
  const dailyBudget = daysLeft != null && daysLeft > 0 && newRemaining > 0
    ? newRemaining / daysLeft
    : null

  const isClickable = !!onClick

  return (
    <div
      className={`px-2.5 py-2 rounded-md border ${statusColor.bg} ${statusColor.border} ${
        isClickable ? "cursor-pointer hover:brightness-95 transition-[filter]" : ""
      }`}
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick!() }
      } : undefined}
    >
      {/* Optional header: icon + name + add funds */}
      {showHeader && (
        <div className="flex items-center gap-2 mb-1.5">
          {budget.category_icon && (
            <span className="text-base shrink-0 w-5 text-center">{budget.category_icon}</span>
          )}
          <span className="text-sm font-medium flex-1 min-w-0 truncate">{budget.category_name}</span>
          {isCurrentMonth && onAddFunds && (
            <button
              onClick={onAddFunds}
              className="shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors"
              title="Add funds to this category"
            >
              <Plus className="h-3 w-3" />
              <span className="hidden sm:inline">Add funds</span>
            </button>
          )}
        </div>
      )}

      {/* Progress bar + percentage */}
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

      {/* Spent / allocated + remaining */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {formatCurrency(spent)} <span className="mx-0.5">/</span> {formatCurrency(allocated, 0)}
        </span>
        <span>
          <span className="font-semibold">{formatCurrency(remaining)} left</span>
          {dailyBudget != null && <span className="text-muted-foreground"> · {formatCurrency(dailyBudget, 0)}/day</span>}
        </span>
      </div>

      {/* Expense preview (only when additionalAmount > 0) */}
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
