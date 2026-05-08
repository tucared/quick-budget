"use client"

import { useEffect, useMemo, useState } from "react"
import { format, isToday, isYesterday } from "date-fns"
import type { ExpenseWithDetails, Category } from "@/lib/types"
import { parseLocalDate } from "@/lib/date-utils"
import { useExpenseDelete } from "@/lib/hooks/use-expense-delete"
import { ExpenseCard } from "@/components/expense-card"
import { EditExpenseDialog } from "@/components/edit-expense-dialog"

interface ExpenseListClientProps {
  expenses: ExpenseWithDetails[]
  categories: Category[]
}

export function ExpenseListClient({
  expenses,
  categories: categoryList,
}: ExpenseListClientProps) {
  const categories = useMemo(() => {
    const map = new Map<string, Category>()
    categoryList.forEach((cat) => map.set(cat.id, cat))
    return map
  }, [categoryList])
  const [visibleCount, setVisibleCount] = useState(10)

  const [editingExpense, setEditingExpense] = useState<ExpenseWithDetails | null>(null)

  const {
    showingDeleteId,
    deletingIds,
    deleteError,
    handleCardClick,
    handleDelete,
    clearDeletingId,
  } = useExpenseDelete()

  const handleEdit = (expenseId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const exp = expenses.find((ex) => ex.id === expenseId)
    if (exp) setEditingExpense(exp)
  }

  // Clean up deleting animation state when expense is removed from list (via realtime DELETE)
  useEffect(() => {
    if (deletingIds.size === 0) return
    const expenseIds = new Set(expenses.map((e) => e.id))
    deletingIds.forEach((id) => {
      if (!expenseIds.has(id)) {
        clearDeletingId(id)
      }
    })
  }, [expenses, deletingIds, clearDeletingId])

  if (expenses.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-lg font-medium mb-2">No expenses yet</p>
        <p className="text-sm">Add your first expense using the form above</p>
      </div>
    )
  }

  const visibleExpenses = expenses.slice(0, visibleCount)
  const hasMore = expenses.length > visibleCount

  // Group expenses by date
  const groupedExpenses: { label: string; expenses: typeof visibleExpenses }[] = []
  const seenDates = new Map<string, number>()

  for (const expense of visibleExpenses) {
    const dateKey = expense.expense_date
    if (!seenDates.has(dateKey)) {
      const parsed = parseLocalDate(dateKey)
      let label: string
      if (isToday(parsed)) label = "Today"
      else if (isYesterday(parsed)) label = "Yesterday"
      else label = format(parsed, "EEE, MMM d")
      seenDates.set(dateKey, groupedExpenses.length)
      groupedExpenses.push({ label, expenses: [] })
    }
    groupedExpenses[seenDates.get(dateKey)!].expenses.push(expense)
  }

  return (
    <div>
      <h2 className="text-xs font-medium text-muted-foreground mb-3">
        Recent Expenses
      </h2>
      {deleteError && (
        <div className="mb-3 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {deleteError}
        </div>
      )}
      {groupedExpenses.map(({ label, expenses: group }) => (
        <div key={label} className="mb-5">
          <div className="text-xs font-medium text-muted-foreground mb-2 px-1">
            {label}
          </div>
          <div className="divide-y divide-border">
            {group.map((expense) => (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                category={expense.category_id ? categories.get(expense.category_id) : null}
                isShowingDelete={showingDeleteId === expense.id}
                isDeleting={deletingIds.has(expense.id)}
                onCardClick={handleCardClick}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      ))}

      {hasMore && (
        <div className="mt-2 text-center">
          <button
            onClick={() => setVisibleCount((prev) => prev + 10)}
            className="px-6 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-accent transition-colors"
          >
            Show More
          </button>
        </div>
      )}

      <EditExpenseDialog
        open={editingExpense !== null}
        onOpenChange={(open) => { if (!open) setEditingExpense(null) }}
        expense={editingExpense}
        categories={categoryList}
      />
    </div>
  )
}
