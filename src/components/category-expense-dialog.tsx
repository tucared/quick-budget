"use client"

import { useState, useMemo } from "react"
import { format, getDaysInMonth } from "date-fns"
import type { BudgetSummary, Expense, Category } from "@/lib/types"
import { monthPrefix, parseLocalDate } from "@/lib/date-utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useExpenseDelete } from "@/lib/hooks/use-expense-delete"
import { ExpenseCard } from "@/components/expense-card"
import { EditExpenseDialog } from "@/components/edit-expense-dialog"
import { CategoryBudgetCard } from "@/components/category-budget-card"

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

    const budgetYearMonth = monthPrefix(budgetMonth)

    return allExpenses
      .filter((expense) =>
        !deletedIds.has(expense.id) &&
        expense.category_id === budget.category_id &&
        expense.expense_date.startsWith(budgetYearMonth)
      )
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date))
  }, [budget, budgetMonth, allExpenses, deletedIds])

  if (!budget) return null

  const today = new Date()
  const isCurrentMonth = budgetMonth.startsWith(format(today, "yyyy-MM"))
  const dayOfMonth = isCurrentMonth ? today.getDate() : undefined
  const daysInMonth = isCurrentMonth ? getDaysInMonth(today) : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {budget.category_icon && (
              <span className="mr-2">{budget.category_icon}</span>
            )}
            {budget.category_name} - {format(parseLocalDate(budgetMonth), "MMMM yyyy")}
          </DialogTitle>
        </DialogHeader>

        <CategoryBudgetCard
          budget={budget}
          showHeader={false}
          isCurrentMonth={isCurrentMonth}
          dayOfMonth={dayOfMonth}
          daysInMonth={daysInMonth}
        />

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
            <div className="divide-y divide-border">
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
