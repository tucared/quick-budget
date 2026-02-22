"use client"

import { useEffect, useState } from "react"
import { format, isToday, isYesterday, parseISO } from "date-fns"
import type { ExpenseWithDetails, Category } from "@/lib/types"
import { useExpenseSubscription } from "@/lib/hooks/use-expense-subscription"
import { useExpenseDelete } from "@/lib/hooks/use-expense-delete"
import { ExpenseCard } from "@/components/expense-card"

interface ExpenseListClientProps {
  initialExpenses: ExpenseWithDetails[]
  initialCategories: Category[]
  householdId: string
}

export function ExpenseListClient({
  initialExpenses,
  initialCategories,
  householdId: _householdId,
}: ExpenseListClientProps) {
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>(initialExpenses)
  const [categories, setCategories] = useState<Map<string, Category>>(() => {
    const map = new Map<string, Category>()
    initialCategories.forEach((cat) => map.set(cat.id, cat))
    return map
  })
  const [visibleCount, setVisibleCount] = useState(10)

  const {
    showingDeleteId,
    deletingIds,
    deleteError,
    handleCardClick,
    handleDelete,
    clearDeletingId,
  } = useExpenseDelete()

  // Update state when initial data changes
  useEffect(() => {
    setExpenses(initialExpenses)
  }, [initialExpenses])

  useEffect(() => {
    const map = new Map<string, Category>()
    initialCategories.forEach((cat) => map.set(cat.id, cat))
    setCategories(map)
  }, [initialCategories])

  // Subscribe to real-time expense changes
  useExpenseSubscription(
    (event) => {
      if (event.type === "INSERT") {
        setExpenses((prev) => [event.new as ExpenseWithDetails, ...prev.slice(0, 19)])
      } else if (event.type === "UPDATE") {
        const updatedExpense = event.new as ExpenseWithDetails
        setExpenses((prev) =>
          prev.map((exp) => (exp.id === updatedExpense.id ? updatedExpense : exp))
        )
      } else if (event.type === "DELETE") {
        const deletedExpense = event.old as ExpenseWithDetails
        setExpenses((prev) => prev.filter((exp) => exp.id !== deletedExpense.id))
        clearDeletingId(deletedExpense.id)
      }
    },
    true
  )

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
      const parsed = parseISO(dateKey)
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
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
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
          <div className="space-y-2">
            {group.map((expense) => (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                category={expense.category_id ? categories.get(expense.category_id) : null}
                isShowingDelete={showingDeleteId === expense.id}
                isDeleting={deletingIds.has(expense.id)}
                onCardClick={handleCardClick}
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
    </div>
  )
}
