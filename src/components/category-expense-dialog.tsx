"use client"

import { useState, useMemo } from "react"
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns"
import { Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase"
import type { BudgetSummary, Expense, Category } from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/currency"
import { useExpenseSubscription } from "@/lib/hooks/use-expense-subscription"
import { getErrorMessage } from "@/lib/error-handler"

interface CategoryExpenseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  budget: BudgetSummary | null
  householdId: string
  budgetMonth: string
  allExpenses: Expense[]
  categories: Category[]
}

export function CategoryExpenseDialog({
  open,
  onOpenChange,
  budget,
  householdId: _householdId,
  budgetMonth,
  allExpenses,
  categories,
}: CategoryExpenseDialogProps) {
  const [realtimeExpenses, setRealtimeExpenses] = useState<Expense[]>([])
  const [showingDeleteId, setShowingDeleteId] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [deleteError, setDeleteError] = useState("")

  // Create lookup maps
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>()
    categories.forEach((cat) => map.set(cat.id, cat))
    return map
  }, [categories])

  // Filter expenses to this category and month (derived state using useMemo)
  const expenses = useMemo(() => {
    if (!budget) return []

    const monthStart = startOfMonth(parseISO(budgetMonth))
    const monthEnd = endOfMonth(parseISO(budgetMonth))

    // Merge initial expenses with real-time updates
    const allExpensesMap = new Map<string, Expense>()

    // Add initial expenses
    allExpenses.forEach((expense) => {
      allExpensesMap.set(expense.id, expense)
    })

    // Overlay real-time updates
    realtimeExpenses.forEach((expense) => {
      allExpensesMap.set(expense.id, expense)
    })

    // Filter to this category and month
    const filtered = Array.from(allExpensesMap.values()).filter((expense) => {
      const expenseDate = new Date(expense.expense_date)
      return (
        expense.category_id === budget.category_id &&
        expenseDate >= monthStart &&
        expenseDate <= monthEnd
      )
    })

    return filtered
  }, [budget, budgetMonth, allExpenses, realtimeExpenses])

  const handleCardClick = (expenseId: string) => {
    // Toggle delete button visibility on mobile
    setShowingDeleteId(showingDeleteId === expenseId ? null : expenseId)
  }

  const handleDelete = async (expenseId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card click from firing
    setDeletingIds((prev) => new Set(prev).add(expenseId))
    setShowingDeleteId(null)
    setDeleteError("")

    const supabase = createClient()
    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", expenseId)

    if (error) {
      setDeleteError(getErrorMessage(error))
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(expenseId)
        return next
      })
    }
  }

  // Subscribe to real-time expense changes
  useExpenseSubscription(
    (event) => {
      if (event.type === "INSERT") {
        setRealtimeExpenses((prev) => [event.new as Expense, ...prev])
      } else if (event.type === "UPDATE") {
        const updatedExpense = event.new as Expense
        setRealtimeExpenses((prev) => {
          const exists = prev.some((exp) => exp.id === updatedExpense.id)
          if (exists) {
            return prev.map((exp) =>
              exp.id === updatedExpense.id ? updatedExpense : exp
            )
          } else {
            return [updatedExpense, ...prev]
          }
        })
      } else if (event.type === "DELETE") {
        const deletedExpense = event.old as Expense
        setRealtimeExpenses((prev) =>
          prev.filter((exp) => exp.id !== deletedExpense.id)
        )
        setDeletingIds((prev) => {
          const next = new Set(prev)
          next.delete(deletedExpense.id)
          return next
        })
      }
    },
    open
  )

  if (!budget) return null

  const allocated = Number(budget.allocated_amount)
  const spent = Number(budget.spent_amount)
  const remaining = Number(budget.remaining_amount)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {budget.category_icon && <span className="mr-2">{budget.category_icon}</span>}
            {budget.category_name} - {format(parseISO(budgetMonth), "MMMM yyyy")}
          </DialogTitle>
        </DialogHeader>

        {/* Budget Summary */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Allocated</div>
            <div className="font-semibold">{formatCurrency(allocated, 0)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Spent</div>
            <div className="font-semibold">{formatCurrency(spent)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Remaining</div>
            <div className={`font-semibold ${remaining < 0 ? "text-destructive" : "text-green-600"}`}>
              {formatCurrency(remaining)}
            </div>
          </div>
        </div>

        {/* Expense List */}
        <div className="flex-1 overflow-y-auto">
          {deleteError && (
            <div className="mb-3 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
              {deleteError}
            </div>
          )}

          {expenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-lg font-medium mb-2">No expenses yet</p>
              <p className="text-sm">No expenses in this category for this month</p>
            </div>
          ) : (
            <div className="space-y-3">
              {expenses.map((expense) => {
                const category = expense.category_id
                  ? categoryMap.get(expense.category_id)
                  : null

                const isShowingDelete = showingDeleteId === expense.id
                const isDeleting = deletingIds.has(expense.id)

                return (
                  <div
                    key={expense.id}
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
                        onClick={() => handleCardClick(expense.id)}
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
                            </div>
                            <div className="relative flex items-start">
                              {/* Amount */}
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
                              {/* Delete button - shows on click (mobile) or hover (desktop) */}
                              <button
                                onClick={(e) => handleDelete(expense.id, e)}
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
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
