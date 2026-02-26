"use client"

import { useCallback, useRef, useState } from "react"
import type { ExpenseWithDetails, Category, Expense } from "@/lib/types"
import { useExpenseSubscription, type ExpenseChangeEvent } from "@/lib/hooks/use-expense-subscription"
import { ExpenseForm } from "@/components/expense-form"
import { ExpenseListClient } from "@/components/expense-list-client"

interface ExpensesPageClientProps {
  initialExpenses: ExpenseWithDetails[]
  initialCategories: Category[]
}

export function ExpensesPageClient({
  initialExpenses,
  initialCategories,
}: ExpensesPageClientProps) {
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>(initialExpenses)

  // Track IDs of expenses we've already added optimistically to avoid duplicates from realtime
  const optimisticIdsRef = useRef<Set<string>>(new Set())

  // Called immediately after the form saves — adds expense to list without waiting for realtime
  const handleExpenseSaved = useCallback((expense: Expense) => {
    optimisticIdsRef.current.add(expense.id)
    // Prune after 10s in case the realtime INSERT echo never arrives
    setTimeout(() => { optimisticIdsRef.current.delete(expense.id) }, 10_000)
    setExpenses((prev) => [expense as ExpenseWithDetails, ...prev].slice(0, 50))
  }, [])

  // Handle realtime events for partner-initiated changes and deletes/updates
  const handleRealtimeEvent = useCallback((event: ExpenseChangeEvent) => {
    if (event.type === "INSERT") {
      const newExpense = event.new as ExpenseWithDetails
      // Skip if we already added this optimistically (our own save)
      if (optimisticIdsRef.current.has(newExpense.id)) {
        optimisticIdsRef.current.delete(newExpense.id)
        return
      }
      // Partner added an expense — add to list (dedup by ID in case of race)
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
      <div className="bg-card border rounded-lg p-6 shadow-xs mb-6">
        <h2 className="text-xl font-semibold mb-4">Add Expense</h2>
        <ExpenseForm onExpenseSaved={handleExpenseSaved} />
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
