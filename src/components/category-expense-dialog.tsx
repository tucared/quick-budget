"use client"

import { useState, useMemo } from "react"
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns"
import type { BudgetSummary, Expense, Category } from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatCurrency } from "@/lib/currency"
import { useExpenseDelete } from "@/lib/hooks/use-expense-delete"
import { ExpenseCard } from "@/components/expense-card"
import { EditExpenseDialog } from "@/components/edit-expense-dialog"

interface CategoryExpenseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  budget: BudgetSummary | null
  budgetMonth: string
  allExpenses: Expense[]
  categories: Category[]
}

export function CategoryExpenseDialog({
  open,
  onOpenChange,
  budget,
  budgetMonth,
  allExpenses,
  categories,
}: CategoryExpenseDialogProps) {
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)

  // Optimistic delete: track IDs removed in this session so they disappear immediately
  // before the parent's reloadExpenses() finishes. Safe to keep across category/open changes
  // since deleted IDs won't appear in allExpenses once the parent reloads.
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())

  const {
    showingDeleteId,
    deletingIds,
    deleteError,
    handleCardClick,
    handleDelete: handleDeleteBase,
  } = useExpenseDelete()

  // Wrap delete to mark as deleted immediately (optimistic UI)
  const handleDelete = (expenseId: string, e: React.MouseEvent) => {
    setDeletedIds((prev) => new Set([...prev, expenseId]))
    handleDeleteBase(expenseId, e)
  }

  const handleEdit = (expenseId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const exp = allExpenses.find((ex) => ex.id === expenseId)
    if (exp) setEditingExpense(exp)
  }

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>()
    categories.forEach((cat) => map.set(cat.id, cat))
    return map
  }, [categories])

  const expenses = useMemo(() => {
    if (!budget) return []

    const monthStart = startOfMonth(parseISO(budgetMonth))
    const monthEnd = endOfMonth(parseISO(budgetMonth))

    return allExpenses
      .filter((expense) => {
        const expenseDate = new Date(expense.expense_date + "T00:00:00")
        return (
          !deletedIds.has(expense.id) &&
          expense.category_id === budget.category_id &&
          expenseDate >= monthStart &&
          expenseDate <= monthEnd
        )
      })
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date))
  }, [budget, budgetMonth, allExpenses, deletedIds])

  if (!budget) return null

  const allocated = Number(budget.allocated_amount)
  const spent = Number(budget.spent_amount)
  const remaining = Number(budget.remaining_amount)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {budget.category_icon && (
              <span className="mr-2">{budget.category_icon}</span>
            )}
            {budget.category_name} - {format(parseISO(budgetMonth), "MMMM yyyy")}
          </DialogTitle>
        </DialogHeader>

        {/* Budget Summary */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Allocated</div>
            <div className="font-semibold">{formatCurrency(allocated)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Spent</div>
            <div className="font-semibold">{formatCurrency(spent)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Remaining</div>
            <div
              className={`font-semibold ${remaining < 0 ? "text-destructive" : "text-green-600"}`}
            >
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
              {expenses.map((expense) => (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  category={expense.category_id ? categoryMap.get(expense.category_id) : null}
                  isShowingDelete={showingDeleteId === expense.id}
                  isDeleting={deletingIds.has(expense.id)}
                  showDate
                  onCardClick={handleCardClick}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>

        <EditExpenseDialog
          open={editingExpense !== null}
          onOpenChange={(open) => { if (!open) setEditingExpense(null) }}
          expense={editingExpense}
          categories={categories}
        />
      </DialogContent>
    </Dialog>
  )
}
