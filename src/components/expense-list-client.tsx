"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { format, isToday, isYesterday } from "date-fns"
import { Search, X } from "lucide-react"
import type { Expense, ExpenseWithDetails, Category } from "@/lib/types"
import { parseLocalDate } from "@/lib/date-utils"
import { useExpenseDelete } from "@/lib/hooks/use-expense-delete"
import { ExpenseCard } from "@/components/expense-card"
import { EditExpenseDialog } from "@/components/edit-expense-dialog"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase"

interface ExpenseListClientProps {
  expenses: ExpenseWithDetails[]
  categories: Category[]
  hasMore: boolean
  onLoadMore: () => Promise<void>
  onExpenseUpdated?: (updated: Expense) => void
  onExpenseDeleted?: (id: string) => void
}

const SEARCH_LIMIT = 50

// Strip PostgREST and ILIKE special characters so user input can be embedded
// safely into a .or() filter. Users don't search with these.
function sanitizeQuery(q: string) {
  return q.replace(/[%_,()\\:*]/g, "").trim()
}

export function ExpenseListClient({
  expenses,
  categories: categoryList,
  hasMore,
  onLoadMore,
  onExpenseUpdated,
  onExpenseDeleted,
}: ExpenseListClientProps) {
  const categories = useMemo(() => {
    const map = new Map<string, Category>()
    categoryList.forEach((cat) => map.set(cat.id, cat))
    return map
  }, [categoryList])

  const [editingExpense, setEditingExpense] = useState<ExpenseWithDetails | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchData, setSearchData] = useState<{ query: string; results: ExpenseWithDetails[] } | null>(null)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef(onLoadMore)
  useEffect(() => { loadMoreRef.current = onLoadMore }, [onLoadMore])

  const closeSearch = () => {
    setSearchInput("")
    setSearchOpen(false)
  }

  const {
    showingDeleteId,
    deletingIds,
    deleteError,
    handleCardClick,
    handleDelete,
    clearDeletingId,
  } = useExpenseDelete(onExpenseDeleted)

  // Debounce raw input → committed search query
  useEffect(() => {
    const handle = setTimeout(() => setSearchQuery(searchInput.trim()), 200)
    return () => clearTimeout(handle)
  }, [searchInput])

  // Run search against Supabase when query changes. State is only set
  // inside async callbacks to avoid cascading renders during the effect.
  useEffect(() => {
    if (!searchQuery) return

    let cancelled = false
    const q = sanitizeQuery(searchQuery)

    if (!q) {
      Promise.resolve().then(() => {
        if (!cancelled) setSearchData({ query: searchQuery, results: [] })
      })
      return () => { cancelled = true }
    }

    const matchingCategoryIds = categoryList
      .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
      .map((c) => c.id)

    const filters = [`description.ilike.%${q}%`]
    if (matchingCategoryIds.length > 0) {
      filters.push(`category_id.in.(${matchingCategoryIds.join(",")})`)
    }

    const supabase = createClient()
    supabase
      .from("expenses")
      .select("*")
      .or(filters.join(","))
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(SEARCH_LIMIT)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error("Failed to search expenses:", error)
          setSearchData({ query: searchQuery, results: [] })
        } else {
          setSearchData({ query: searchQuery, results: (data ?? []) as ExpenseWithDetails[] })
        }
      })

    return () => { cancelled = true }
  }, [searchQuery, categoryList])

  // Derived search-mode flags — avoid storing redundant state.
  const isSearchMode = searchQuery !== ""
  const resultsForCurrentQuery = searchData?.query === searchQuery ? searchData.results : null
  const searching = isSearchMode && resultsForCurrentQuery === null

  const handleEdit = (expenseId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const pool = resultsForCurrentQuery ?? expenses
    const exp = pool.find((ex) => ex.id === expenseId)
    if (exp) setEditingExpense(exp)
  }

  // Infinite scroll: trigger onLoadMore when sentinel enters viewport.
  // Disabled while searching — search owns its own result set.
  useEffect(() => {
    if (isSearchMode) return
    if (!hasMore) return
    const node = sentinelRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreRef.current()
        }
      },
      { rootMargin: "200px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, isSearchMode, expenses.length])

  // Clean up deleting animation state when expense is removed from list (via realtime DELETE)
  useEffect(() => {
    if (deletingIds.size === 0) return
    const pool = resultsForCurrentQuery ?? expenses
    const expenseIds = new Set(pool.map((e) => e.id))
    deletingIds.forEach((id) => {
      if (!expenseIds.has(id)) {
        clearDeletingId(id)
      }
    })
  }, [expenses, resultsForCurrentQuery, deletingIds, clearDeletingId])

  const visibleExpenses = isSearchMode ? (resultsForCurrentQuery ?? []) : expenses

  // Group expenses by date
  const groupedExpenses: { label: string; expenses: ExpenseWithDetails[] }[] = []
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

  const isEmpty = visibleExpenses.length === 0

  return (
    <div>
      <div className="flex items-center justify-between mb-3 px-1 gap-2 min-h-9">
        {searchOpen ? (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              inputMode="search"
              autoComplete="off"
              autoFocus
              placeholder="Search description or category"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") closeSearch() }}
              className="pl-9 pr-9 h-9"
            />
            <button
              type="button"
              onClick={closeSearch}
              aria-label="Close search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-base font-semibold">Recent expenses</h2>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search expenses"
              className="p-1.5 -mr-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent"
            >
              <Search className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {isSearchMode && !searching && (
        <div className="text-xs text-muted-foreground mb-3 px-1">
          {visibleExpenses.length}{visibleExpenses.length === SEARCH_LIMIT ? "+" : ""} match{visibleExpenses.length === 1 ? "" : "es"} for &ldquo;{searchQuery}&rdquo;
        </div>
      )}

      {deleteError && (
        <div className="mb-3 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {deleteError}
        </div>
      )}

      {isEmpty && !searching && (
        <div className="text-center py-8 text-muted-foreground">
          {isSearchMode ? (
            <p className="text-sm">No expenses match &ldquo;{searchQuery}&rdquo;</p>
          ) : (
            <>
              <p className="text-lg font-medium mb-2">No expenses yet</p>
              <p className="text-sm">Add your first expense using the form above</p>
            </>
          )}
        </div>
      )}

      {searching && isEmpty && (
        <div className="text-center py-8 text-sm text-muted-foreground">Searching…</div>
      )}

      {groupedExpenses.map(({ label, expenses: group }) => (
        <div key={label} className="mb-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70 mb-1.5 px-1">
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

      {!isSearchMode && hasMore && (
        <div ref={sentinelRef} className="py-4 text-center">
          <button
            onClick={() => loadMoreRef.current()}
            className="px-4 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-accent transition-colors"
          >
            Load older
          </button>
        </div>
      )}

      <EditExpenseDialog
        open={editingExpense !== null}
        onOpenChange={(open) => { if (!open) setEditingExpense(null) }}
        expense={editingExpense}
        categories={categoryList}
        onSaved={onExpenseUpdated}
      />
    </div>
  )
}
