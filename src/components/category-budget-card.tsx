import { memo } from "react"
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
  // Handlers receive the budget so parents can pass stable refs (useCallback)
  // instead of per-row arrow closures that defeat React.memo.
  onClick?: (budget: BudgetSummary) => void
  onAddFunds?: (e: React.MouseEvent, budget: BudgetSummary) => void
  additionalAmount?: number
  loading?: boolean
  // Single-line variant for the expense form: keeps the progress bar (subtly)
  // and the projected "X left" figure, dropping the percentage / spent-allocated
  // rows so budget impact + Save stay reachable with the keyboard up.
  compact?: boolean
}

function CategoryBudgetCardImpl({
  budget,
  showHeader = false,
  isCurrentMonth = false,
  dayOfMonth,
  daysInMonth,
  onClick,
  onAddFunds,
  additionalAmount = 0,
  loading = false,
  compact = false,
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
      <div className="px-2.5 py-2 bg-[hsl(36,40%,94%)] border border-[hsl(36,30%,78%)] rounded-md text-xs text-[hsl(24,85%,42%)]">
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

  const isClickable = !!onClick

  // Compact single-line variant: subtle progress bar + the figure that matters
  // while logging (projected remaining once additionalAmount is known, else the
  // current remaining). Header icon distinguishes the overflow card.
  if (compact) {
    return (
      <div
        className={`px-2.5 py-1.5 rounded-md border flex items-center gap-2.5 ${statusColor.bg} ${statusColor.border}`}
      >
        {showHeader && budget.category_icon && (
          <span className="text-sm shrink-0 leading-none">{budget.category_icon}</span>
        )}
        <div className="flex-1 min-w-0 h-1 bg-border rounded-full overflow-hidden flex">
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
        <span className={`text-xs font-semibold shrink-0 ${willOverspend ? "text-destructive" : statusColor.text}`}>
          {formatCurrency(additionalAmount > 0 ? newRemaining : remaining)} left{willOverspend && " ⚠️"}
        </span>
      </div>
    )
  }

  return (
    <div
      className={`px-2.5 py-2 rounded-md border ${statusColor.bg} ${statusColor.border} ${
        isClickable ? "cursor-pointer hover:brightness-95 transition-[filter]" : ""
      }`}
      onClick={onClick ? () => onClick(budget) : undefined}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick!(budget) }
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
              onClick={(e) => onAddFunds(e, budget)}
              className="shrink-0 flex items-center gap-1 text-xs text-accent hover:text-accent/80 font-medium px-1.5 py-0.5 rounded hover:bg-accent/10 transition-colors"
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
        <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden flex">
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
        <span className={`text-xs font-semibold ${statusColor.text} shrink-0`}>
          {formatNumber(newPercentSpent, 0)}%
        </span>
      </div>

      {/* Spent / allocated + remaining */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {formatCurrency(spent)} <span className="mx-0.5">/</span> {formatCurrency(allocated)}
        </span>
        <span>
          <span className="font-semibold">{formatCurrency(remaining)} left</span>
        </span>
      </div>

      {/* Expense preview (only when additionalAmount > 0) */}
      {additionalAmount > 0 && (
        <div className={`mt-1.5 pt-1.5 border-t ${statusColor.border}`}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">After this expense:</span>
            <span className={`font-bold ${willOverspend ? 'text-destructive' : statusColor.text}`}>
              {formatCurrency(newRemaining)} left
              {willOverspend && " ⚠️"}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export const CategoryBudgetCard = memo(CategoryBudgetCardImpl)
