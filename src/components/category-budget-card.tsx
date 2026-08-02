import { memo, type ReactNode } from "react"
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
  // Compact-only: when true, show the slice this expense puts into the category
  // (additionalAmount) in parentheses after the name — so a split reads as
  // "Dining Out (€10,00)" / "User One (€20,00)".
  showFraction?: boolean
  // Compact-only: inline control rendered in the top row before the "X left"
  // figure (the cap checkbox on the category bar, the person buttons on the
  // allowance bar).
  trailing?: ReactNode
  // The household's base currency — all amounts on this card are denominated in
  // it. Defaults to EUR for the original household / standalone usage.
  baseCurrency?: string
  // Compact-only fallback label when `budget` is null (no allocation for this
  // month yet): `budget_summary` has no row to read the name/icon from, so
  // the caller passes the category's own values instead.
  categoryName?: string
  categoryIcon?: string
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
  showFraction = false,
  trailing,
  baseCurrency = "EUR",
  categoryName,
  categoryIcon,
}: CategoryBudgetCardProps) {
  if (loading) {
    return (
      <div className="px-2.5 py-2 bg-muted/50 rounded-md text-xs text-muted-foreground">
        Loading budget status...
      </div>
    )
  }

  if (!budget) {
    // Compact variant (expense form / edit dialog): keep the same row shape
    // as a normal bar — name, fraction, and `trailing` (the Cap checkbox or
    // overflow-allowance picker) all still need to render here, otherwise a
    // month with no allocation silently drops the checkbox and the cap split
    // applies with no way to turn it off. Just gray out the bar itself.
    if (compact) {
      return (
        <div className="px-2.5 py-1.5 rounded-md border bg-muted/40 border-border">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="flex items-center gap-1 min-w-0 text-xs font-medium text-muted-foreground">
              {categoryIcon && <span className="shrink-0 leading-none">{categoryIcon}</span>}
              <span className="truncate">{categoryName}</span>
              {showFraction && additionalAmount > 0 && (
                <span className="shrink-0 font-normal">
                  ({formatCurrency(additionalAmount, 2, baseCurrency)})
                </span>
              )}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {trailing}
              <span className="text-xs text-muted-foreground">No budget set</span>
            </div>
          </div>
          <div className="h-1 bg-border rounded-full overflow-hidden">
            <div className="h-full w-full bg-muted-foreground/25" />
          </div>
        </div>
      )
    }
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

  // Compact variant for the expense form: a labelled name + remaining row over
  // a subtle progress bar. Shows the projected remaining once additionalAmount
  // is known, else the current remaining — keeping the budget impact legible
  // without the full card's percentage / spent-allocated rows.
  if (compact) {
    return (
      <div className={`px-2.5 py-1.5 rounded-md border ${statusColor.bg} ${statusColor.border}`}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="flex items-center gap-1 min-w-0 text-xs font-medium">
            {budget.category_icon && <span className="shrink-0 leading-none">{budget.category_icon}</span>}
            <span className="truncate">{budget.category_name}</span>
            {showFraction && additionalAmount > 0 && (
              <span className="shrink-0 font-normal text-muted-foreground">
                ({formatCurrency(additionalAmount, 2, baseCurrency)})
              </span>
            )}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {trailing}
            <span className={`text-xs font-semibold ${willOverspend ? "text-destructive" : statusColor.text}`}>
              {formatCurrency(additionalAmount > 0 ? newRemaining : remaining, 2, baseCurrency)} left{willOverspend && " ⚠️"}
            </span>
          </div>
        </div>
        <div className="h-1 bg-border rounded-full overflow-hidden flex">
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
          {formatCurrency(spent, 2, baseCurrency)} <span className="mx-0.5">/</span> {formatCurrency(allocated, 2, baseCurrency)}
        </span>
        <span>
          <span className="font-semibold">{formatCurrency(remaining, 2, baseCurrency)} left</span>
        </span>
      </div>

      {/* Expense preview (only when additionalAmount > 0) */}
      {additionalAmount > 0 && (
        <div className={`mt-1.5 pt-1.5 border-t ${statusColor.border}`}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">After this expense:</span>
            <span className={`font-bold ${willOverspend ? 'text-destructive' : statusColor.text}`}>
              {formatCurrency(newRemaining, 2, baseCurrency)} left
              {willOverspend && " ⚠️"}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export const CategoryBudgetCard = memo(CategoryBudgetCardImpl)
