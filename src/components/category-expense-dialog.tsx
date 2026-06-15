"use client"

import { useCallback, useMemo, useRef, useState, useEffect } from "react"
import { format, getDaysInMonth } from "date-fns"
import type { BudgetSummary, Expense, Category } from "@/lib/types"
import { monthPrefix, parseLocalDate } from "@/lib/date-utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useExpenseDelete, type DeletableExpense } from "@/lib/hooks/use-expense-delete"
import { ExpenseCard } from "@/components/expense-card"
import { EditExpenseDialog } from "@/components/edit-expense-dialog"
import { CategoryBudgetCard } from "@/components/category-budget-card"
import { CategoryDailySpendingChart } from "@/components/category-daily-spending-chart"
import { useCurrency } from "@/lib/contexts/user-context"

interface CategoryExpenseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  budget: BudgetSummary | null
  budgetMonth: string
  allExpenses: Expense[]
  categories: Category[]
  /** expense id → tricount title for rows mirrored by sync (read-only, tagged). */
  syncedExpenseTitles?: Record<string, string>
}

export function CategoryExpenseDialog({
  open,
  onOpenChange,
  budget,
  budgetMonth,
  allExpenses,
  categories,
  syncedExpenseTitles,
}: CategoryExpenseDialogProps) {
  const { baseCurrency } = useCurrency()
  const [editingExpenses, setEditingExpenses] = useState<Expense[] | null>(null)

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
  } = useExpenseDelete((ids) => {
    setDeletedIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      return next
    })
  })

  // Wrap delete to mark as deleted immediately (optimistic UI). When the row is
  // part of a split, the hook deletes both siblings; mark the clicked id here
  // and rely on the onDeleted callback above to mark the sibling once known.
  const handleDelete = useCallback(
    (expense: DeletableExpense, e: React.MouseEvent) => {
      setDeletedIds((prev) => new Set([...prev, expense.id]))
      handleDeleteBase(expense, e)
    },
    [handleDeleteBase],
  )

  // Latest-allExpenses ref so handleEdit's identity stays stable across renders.
  const allExpensesRef = useRef(allExpenses)
  useEffect(() => { allExpensesRef.current = allExpenses }, [allExpenses])

  const handleEdit = useCallback((expenseId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const exp = allExpensesRef.current.find((ex) => ex.id === expenseId)
    if (!exp) return
    if (exp.split_group_id) {
      const siblings = allExpensesRef.current.filter(
        (ex) => ex.split_group_id === exp.split_group_id,
      )
      setEditingExpenses(siblings.length >= 2 ? siblings.slice(0, 2) : [exp])
    } else {
      setEditingExpenses([exp])
    }
  }, [])

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>()
    categories.forEach((cat) => map.set(cat.id, cat))
    return map
  }, [categories])

  const syncedTitles = syncedExpenseTitles ?? {}

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
          baseCurrency={baseCurrency}
        />

        <CategoryDailySpendingChart expenses={expenses} budgetMonth={budgetMonth} />

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
                  showSplitBadge
                  importedFrom={syncedTitles[expense.id] ?? null}
                  onCardClick={handleCardClick}
                  onEdit={handleEdit}
                  onDelete={(_id, e) => handleDelete(expense, e)}
                />
              ))}
            </div>
          )}
        </div>

        <EditExpenseDialog
          open={editingExpenses !== null}
          onOpenChange={(open) => { if (!open) setEditingExpenses(null) }}
          siblings={editingExpenses}
          categories={categories}
        />
      </DialogContent>
    </Dialog>
  )
}
