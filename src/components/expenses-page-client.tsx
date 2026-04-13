"use client"

import { useCallback, useState } from "react"
import type { ExpenseWithDetails, Category, Expense } from "@/lib/types"
import { useExpenseSubscription, type ExpenseChangeEvent } from "@/lib/hooks/use-expense-subscription"
import { ExpenseForm } from "@/components/expense-form"
import { ExpenseListClient } from "@/components/expense-list-client"

interface ExpensesPageClientProps {
  initialExpenses: ExpenseWithDetails[]
  initialCategories: Category[]
  initialTopCategoryIds: string[]
}

export function ExpensesPageClient({
  initialExpenses,
  initialCategories,
  initialTopCategoryIds,
}: ExpensesPageClientProps) {
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>(initialExpenses)

  // Called immediately after the form saves — adds expense to list without waiting for realtime
  const handleExpenseSaved = useCallback((expense: Expense) => {
    setExpenses((prev) => [expense as ExpenseWithDetails, ...prev].slice(0, 50))
  }, [])

  // Handle realtime events for partner-initiated changes and deletes/updates
  const handleRealtimeEvent = useCallback((event: ExpenseChangeEvent) => {
    if (event.type === "INSERT") {
      const newExpense = event.new as ExpenseWithDetails
      // Dedup by ID — covers both our own optimistic add and concurrent inserts
      setExpenses((prev) => prev.some((exp) => exp.id === newExpense.id) ? prev : [newExpense, ...prev].slice(0, 50))
    } else if (event.type === "UPDATE") {
      const updated = event.new as ExpenseWithDetails
      setExpenses((prev) =>
        prev.map((exp) => (exp.id === updated.id ? updated : exp))
      )
    } else if (event.type === "DELETE") {
      const deleted = event.old as ExpenseWithDetails
      setExpenses((prev) => prev.filter((exp) => exp.id !== deleted.id))
    }
  }, [])

  useExpenseSubscription(handleRealtimeEvent)

  return (
    <>
      {/* Expense Form */}
      <div className="bg-card border rounded-md p-4 mb-6">
        <ExpenseForm
          onExpenseSaved={handleExpenseSaved}
          initialCategories={initialCategories}
          initialTopCategoryIds={initialTopCategoryIds}
        />
      </div>

      {/* Divider */}
      <hr className="border-border mb-6" />

      {/* Recent Expenses List */}
      <ExpenseListClient
        expenses={expenses}
        categories={initialCategories}
      />
    </>
  )
}
