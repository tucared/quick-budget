"use client"

import { format } from "date-fns"
import { Trash2 } from "lucide-react"
import type { Category } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/currency"

interface ExpenseCardExpense {
  id: string
  category_id: string | null
  description: string | null
  is_cash: boolean
  amount: number
  currency: string
  converted_amount: number
  expense_date: string
}

interface ExpenseCardProps {
  expense: ExpenseCardExpense
  category: Category | null | undefined
  isShowingDelete: boolean
  isDeleting: boolean
  /** Show date + cash inline below description (dialog view). Default: show cash-only badge (list view). */
  showDate?: boolean
  onCardClick: (id: string) => void
  onDelete: (id: string, e: React.MouseEvent) => void
}

export function ExpenseCard({
  expense,
  category,
  isShowingDelete,
  isDeleting,
  showDate = false,
  onCardClick,
  onDelete,
}: ExpenseCardProps) {
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
        <Card
          className="group cursor-pointer md:cursor-default"
          onClick={() => onCardClick(expense.id)}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {category?.icon && (
                    <span className="text-xl">{category.icon}</span>
                  )}
                  <span className="font-medium">
                    {category?.name || "Uncategorized"}
                  </span>
                </div>
                {expense.description && (
                  <p className="text-sm text-muted-foreground truncate">
                    {expense.description}
                  </p>
                )}
                {showDate ? (
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>
                      {format(new Date(expense.expense_date), "MMM d, yyyy")}
                    </span>
                    {expense.is_cash && (
                      <>
                        <span>•</span>
                        <span>Cash</span>
                      </>
                    )}
                  </div>
                ) : (
                  expense.is_cash && (
                    <p className="text-xs text-muted-foreground mt-0.5">Cash</p>
                  )
                )}
              </div>
              <div className="relative flex items-start">
                <div
                  className={`text-right transition-all ${
                    isShowingDelete ? "mr-10" : "md:group-hover:mr-10"
                  }`}
                >
                  <div className="font-semibold text-lg">
                    {formatCurrency(expense.converted_amount)}
                  </div>
                  {expense.currency !== "EUR" && (
                    <div className="text-xs text-muted-foreground">
                      {formatCurrency(expense.amount, 2, expense.currency)}
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => onDelete(expense.id, e)}
                  className={`absolute right-0 top-0 transition-opacity p-1.5 hover:bg-destructive/10 rounded-md text-muted-foreground hover:text-destructive ${
                    isShowingDelete
                      ? "opacity-100 pointer-events-auto"
                      : "opacity-0 pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto"
                  }`}
                  aria-label="Delete expense"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
