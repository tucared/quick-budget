"use client"

import { memo } from "react"
import { format } from "date-fns"
import { Pencil, Trash2 } from "lucide-react"
import type { Category } from "@/lib/types"
import { formatCurrency } from "@/lib/currency"
import { useCurrency } from "@/lib/contexts/user-context"
import { parseLocalDate } from "@/lib/date-utils"

interface ExpenseCardExpense {
  id: string
  category_id: string | null
  description: string | null
  is_cash: boolean
  amount: number
  currency: string
  converted_amount: number
  expense_date: string
  split_group_id: string | null
}

interface ExpenseCardProps {
  expense: ExpenseCardExpense
  category: Category | null | undefined
  isShowingDelete: boolean
  isDeleting: boolean
  /** Show date + cash inline below description (dialog view). Default: show cash-only badge (list view). */
  showDate?: boolean
  /** When inside a per-category drill-down, surface the split membership. */
  showSplitBadge?: boolean
  /** When set, this row was mirrored from the named Tricount: tag it with that
   *  name and suppress edit/delete (managed on the Sync tab). */
  importedFrom?: string | null
  onCardClick: (id: string) => void
  onEdit?: (id: string, e: React.MouseEvent) => void
  onDelete: (id: string, e: React.MouseEvent) => void
}

function ExpenseCardImpl({
  expense,
  category,
  isShowingDelete,
  isDeleting,
  showDate = false,
  showSplitBadge = false,
  importedFrom = null,
  onCardClick,
  onEdit,
  onDelete,
}: ExpenseCardProps) {
  const { baseCurrency, format: fmt } = useCurrency()
  // Imported (Tricount) rows are read-only here — managed on the Sync tab.
  const imported = !!importedFrom
  const showActions = !imported
  return (
    <div
      className={`overflow-hidden transition-all duration-300 ${
        isDeleting ? "max-h-0 opacity-0 mb-0" : "max-h-96 opacity-100"
      }`}
    >
      <div
        className={`transition-all duration-300 ${
          isDeleting ? "scale-95 -translate-x-4" : "scale-100 translate-x-0"
        }`}
      >
        {/* onClick is the mobile tap-to-reveal for edit/delete buttons; on md+ the buttons appear on CSS hover instead */}
        <div
          className={`group py-3 px-1 ${imported ? "cursor-default" : "cursor-pointer md:cursor-default"}`}
          onClick={imported ? undefined : () => onCardClick(expense.id)}
        >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {category?.icon && (
                    <span className="text-xl">{category.icon}</span>
                  )}
                  {/* When a description is set it replaces the category name as
                      the title; otherwise the category name stands in. */}
                  <span className="font-medium truncate min-w-0">
                    {expense.description || category?.name || "Uncategorized"}
                  </span>
                  {expense.is_cash && (
                    <span className="shrink-0 text-[10px] tracking-wide text-muted-foreground border border-border rounded px-1 py-0.5">
                      Cash
                    </span>
                  )}
                  {imported && (
                    <span
                      className="shrink-0 max-w-[10rem] truncate text-[10px] tracking-wide text-muted-foreground border border-border rounded px-1 py-0.5"
                      title={`Imported from “${importedFrom}” — manage on the Sync tab`}
                    >
                      {importedFrom}
                    </span>
                  )}
                  {showSplitBadge && expense.split_group_id && (
                    <span className="shrink-0 text-[10px] tracking-wide text-muted-foreground border border-border rounded px-1 py-0.5">
                      Part of a split
                    </span>
                  )}
                </div>
                {showDate && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {format(parseLocalDate(expense.expense_date), "MMM d, yyyy")}
                  </div>
                )}
              </div>
              <div className="relative flex items-start">
                <div
                  className={`text-right transition-all ${
                    !showActions
                      ? ""
                      : isShowingDelete
                        ? "mr-[4.5rem]"
                        : "md:group-hover:mr-[4.5rem]"
                  }`}
                >
                  <div className="font-semibold text-lg">
                    {fmt(expense.converted_amount)}
                  </div>
                  {expense.currency !== baseCurrency && (
                    <div className="text-xs text-muted-foreground">
                      {formatCurrency(expense.amount, 2, expense.currency)}
                    </div>
                  )}
                </div>
                {showActions && (
                  <div
                    className={`absolute right-0 top-0 flex items-center gap-0.5 transition-opacity ${
                      isShowingDelete
                        ? "opacity-100 pointer-events-auto"
                        : "opacity-0 pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto"
                    }`}
                  >
                    {onEdit && (
                      <button
                        onClick={(e) => onEdit(expense.id, e)}
                        className="p-1.5 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground"
                        aria-label="Edit expense"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => onDelete(expense.id, e)}
                      className="p-1.5 hover:bg-destructive/10 rounded-md text-muted-foreground hover:text-destructive"
                      aria-label="Delete expense"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
        </div>
      </div>
    </div>
  )
}

export const ExpenseCard = memo(ExpenseCardImpl)

interface SplitExpenseCardProps {
  primary: ExpenseCardExpense
  overflow: ExpenseCardExpense
  primaryCategory: Category | null | undefined
  overflowCategory: Category | null | undefined
  isShowingDelete: boolean
  isDeleting: boolean
  onCardClick: (id: string) => void
  onEdit?: (id: string, e: React.MouseEvent) => void
  onDelete: (id: string, e: React.MouseEvent) => void
}

function SplitExpenseCardImpl({
  primary,
  overflow,
  primaryCategory,
  overflowCategory,
  isShowingDelete,
  isDeleting,
  onCardClick,
  onEdit,
  onDelete,
}: SplitExpenseCardProps) {
  const { baseCurrency, format: fmt } = useCurrency()
  const totalConverted = Number(primary.converted_amount) + Number(overflow.converted_amount)
  const showForeign = primary.currency !== baseCurrency
  const foreignTotal = showForeign ? Number(primary.amount) + Number(overflow.amount) : 0
  // The two siblings share description, date, cash flag, currency — read them
  // from the primary row.
  return (
    <div
      className={`overflow-hidden transition-all duration-300 ${
        isDeleting ? "max-h-0 opacity-0 mb-0" : "max-h-[24rem] opacity-100"
      }`}
    >
      <div
        className={`transition-all duration-300 ${
          isDeleting ? "scale-95 -translate-x-4" : "scale-100 translate-x-0"
        }`}
      >
        <div
          className="group cursor-pointer md:cursor-default py-3 px-1"
          onClick={() => onCardClick(primary.id)}
        >
          {/* Header: Split badge + description on the left, total + actions on
              the right. The per-category breakdown sits below as full-width
              rows so its amounts align flush-right with the total — one clean
              right-hand number column. */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="shrink-0 text-[10px] tracking-wide text-muted-foreground border border-border rounded px-1 py-0.5">
                Split
              </span>
              {primary.is_cash && (
                <span className="shrink-0 text-[10px] tracking-wide text-muted-foreground border border-border rounded px-1 py-0.5">
                  Cash
                </span>
              )}
              {primary.description && (
                <span className="text-sm font-medium truncate">{primary.description}</span>
              )}
            </div>
            <div className="relative flex items-start">
              <div
                className={`text-right transition-all ${
                  isShowingDelete ? "mr-[4.5rem]" : "md:group-hover:mr-[4.5rem]"
                }`}
              >
                <div className="font-semibold text-lg">{fmt(totalConverted)}</div>
                {showForeign && (
                  <div className="text-xs text-muted-foreground">
                    {formatCurrency(foreignTotal, 2, primary.currency)}
                  </div>
                )}
              </div>
              <div
                className={`absolute right-0 top-0 flex items-center gap-0.5 transition-opacity ${
                  isShowingDelete
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto"
                }`}
              >
                {onEdit && (
                  <button
                    onClick={(e) => onEdit(primary.id, e)}
                    className="p-1.5 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground"
                    aria-label="Edit split expense"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={(e) => onDelete(primary.id, e)}
                  className="p-1.5 hover:bg-destructive/10 rounded-md text-muted-foreground hover:text-destructive"
                  aria-label="Delete split expense"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          {/* Per-category breakdown: full-width rows, amounts flush-right. */}
          <div className="space-y-0.5 mt-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                {primaryCategory?.icon && <span className="text-base">{primaryCategory.icon}</span>}
                <span className="truncate">{primaryCategory?.name || "Uncategorized"}</span>
              </div>
              <span className="font-medium tabular-nums shrink-0 text-muted-foreground">
                {fmt(primary.converted_amount)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                {overflowCategory?.icon && <span className="text-base">{overflowCategory.icon}</span>}
                <span className="truncate">{overflowCategory?.name || "Uncategorized"}</span>
              </div>
              <span className="font-medium tabular-nums shrink-0 text-muted-foreground">
                {fmt(overflow.converted_amount)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const SplitExpenseCard = memo(SplitExpenseCardImpl)
