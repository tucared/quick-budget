"use client"

import { useCallback, useRef, useState } from "react"
import type { ExpenseWithDetails, Category, Expense } from "@/lib/types"
import { useExpenseSubscription, type ExpenseChangeEvent } from "@/lib/hooks/use-expense-subscription"
import { ExpenseForm } from "@/components/expense-form"
import { ExpenseListClient } from "@/components/expense-list-client"
import { createClient } from "@/lib/supabase"

const PAGE_SIZE = 30

interface ExpensesPageClientProps {
  initialExpenses: ExpenseWithDetails[]
  initialCategories: Category[]
  initialTopCategoryIds: string[]
  /** expense id → tricount title for rows mirrored by sync (read-only, tagged). */
  syncedExpenseTitles?: Record<string, string>
}

export function ExpensesPageClient({
  initialExpenses,
  initialCategories,
  initialTopCategoryIds,
  syncedExpenseTitles,
}: ExpensesPageClientProps) {
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>(initialExpenses)
  const [hasMore, setHasMore] = useState(initialExpenses.length === PAGE_SIZE)
  // Bumped on every external realtime event so the inline ExpenseForm can
  // refresh its budget preview without opening its own subscription.
  const [externalRefreshSignal, setExternalRefreshSignal] = useState(0)
  const loadingRef = useRef(false)

  // Same pattern for edit — replace in place. Realtime UPDATE is unreliable
  // on this project, so the dialog's onSaved callback drives the refresh.
  // Accepts a single expense or an array (split-edit returns both siblings).
  // Brand-new rows (split conversion can insert a new sibling row) are
  // unshifted onto the list rather than dropped.
  const handleExpenseUpdated = useCallback((updated: Expense | Expense[]) => {
    const rows = Array.isArray(updated) ? updated : [updated]
    setExpenses((prev) => {
      const byId = new Map(prev.map((e) => [e.id, e] as const))
      const fresh: ExpenseWithDetails[] = []
      for (const row of rows) {
        if (byId.has(row.id)) {
          byId.set(row.id, row as ExpenseWithDetails)
        } else {
          fresh.push(row as ExpenseWithDetails)
        }
      }
      const merged = prev.map((e) => byId.get(e.id) ?? e)
      return fresh.length > 0 ? [...fresh, ...merged] : merged
    })
  }, [])

  const handleExpenseDeleted = useCallback((ids: string[]) => {
    const toRemove = new Set(ids)
    setExpenses((prev) => prev.filter((exp) => !toRemove.has(exp.id)))
  }, [])

  // Handle realtime events for all inserts (own + partner) and deletes/updates
  const handleRealtimeEvent = useCallback((event: ExpenseChangeEvent) => {
    if (event.type === "INSERT") {
      const newExpense = event.new as ExpenseWithDetails
      // Dedup by ID — guards against replay on reconnect
      setExpenses((prev) => prev.some((exp) => exp.id === newExpense.id) ? prev : [newExpense, ...prev])
    } else if (event.type === "UPDATE") {
      const updated = event.new as ExpenseWithDetails
      setExpenses((prev) =>
        prev.map((exp) => (exp.id === updated.id ? updated : exp))
      )
    } else if (event.type === "DELETE") {
      const deleted = event.old as ExpenseWithDetails
      setExpenses((prev) => prev.filter((exp) => exp.id !== deleted.id))
    }
    setExternalRefreshSignal((n) => n + 1)
  }, [])

  useExpenseSubscription(handleRealtimeEvent)

  // Cursor-based load-more keyed on the oldest loaded expense.
  // Cursor (vs .range()) keeps results stable when realtime inserts arrive mid-scroll.
  const handleLoadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return
    loadingRef.current = true
    try {
      const last = expenses[expenses.length - 1]
      if (!last) return

      const supabase = createClient()
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .or(
          `expense_date.lt.${last.expense_date},and(expense_date.eq.${last.expense_date},created_at.lt.${last.created_at})`
        )
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE)

      if (error) {
        console.error("Failed to load more expenses:", error)
        return
      }

      const batch = (data ?? []) as ExpenseWithDetails[]
      setExpenses((prev) => {
        const seen = new Set(prev.map((e) => e.id))
        const fresh = batch.filter((e) => !seen.has(e.id))
        return [...prev, ...fresh]
      })
      setHasMore(batch.length === PAGE_SIZE)
    } finally {
      loadingRef.current = false
    }
  }, [expenses, hasMore])

  return (
    <>
      {/* Expense Form */}
      <div className="mb-6">
        <ExpenseForm
          initialCategories={initialCategories}
          initialTopCategoryIds={initialTopCategoryIds}
          externalRefreshSignal={externalRefreshSignal}
        />
      </div>

      {/* Recent Expenses List */}
      <ExpenseListClient
        expenses={expenses}
        categories={initialCategories}
        hasMore={hasMore}
        syncedExpenseTitles={syncedExpenseTitles}
        onLoadMore={handleLoadMore}
        onExpenseUpdated={handleExpenseUpdated}
        onExpenseDeleted={handleExpenseDeleted}
      />
    </>
  )
}
