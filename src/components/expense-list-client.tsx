"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase"
import type { ExpenseWithDetails, Category, Account } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/currency"
import { useExpenseSubscription } from "@/lib/hooks/use-expense-subscription"
import { getErrorMessage } from "@/lib/error-handler"

interface ExpenseListClientProps {
  initialExpenses: ExpenseWithDetails[]
  initialCategories: Category[]
  initialAccounts: Account[]
  householdId: string
}

export function ExpenseListClient({
  initialExpenses,
  initialCategories,
  initialAccounts,
  householdId: _householdId,
}: ExpenseListClientProps) {
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>(initialExpenses)
  const [categories, setCategories] = useState<Map<string, Category>>(() => {
    const map = new Map<string, Category>()
    initialCategories.forEach((cat) => map.set(cat.id, cat))
    return map
  })
  const [accounts, setAccounts] = useState<Map<string, Account>>(() => {
    const map = new Map<string, Account>()
    initialAccounts.forEach((acc) => map.set(acc.id, acc))
    return map
  })
  const [showingDeleteId, setShowingDeleteId] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [deleteError, setDeleteError] = useState("")
  const [visibleCount, setVisibleCount] = useState(10)

  // Update state when initial data changes
  useEffect(() => {
    setExpenses(initialExpenses)
  }, [initialExpenses])

  useEffect(() => {
    const map = new Map<string, Category>()
    initialCategories.forEach((cat) => map.set(cat.id, cat))
    setCategories(map)
  }, [initialCategories])

  useEffect(() => {
    const map = new Map<string, Account>()
    initialAccounts.forEach((acc) => map.set(acc.id, acc))
    setAccounts(map)
  }, [initialAccounts])

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
        // Add new expense to the top of the list
        setExpenses((prev) => [event.new as ExpenseWithDetails, ...prev.slice(0, 19)])
      } else if (event.type === "UPDATE") {
        // Update existing expense
        setExpenses((prev) =>
          prev.map((exp) =>
            exp.id === event.new.id ? (event.new as ExpenseWithDetails) : exp
          )
        )
      } else if (event.type === "DELETE") {
        // Remove deleted expense
        setExpenses((prev) => prev.filter((exp) => exp.id !== event.old.id))
        setDeletingIds((prev) => {
          const next = new Set(prev)
          next.delete(event.old.id)
          return next
        })
      }
    },
    true
  )

  if (expenses.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-lg font-medium mb-2">No expenses yet</p>
        <p className="text-sm">
          Add your first expense using the form above
        </p>
      </div>
    )
  }

  const visibleExpenses = expenses.slice(0, visibleCount)
  const hasMore = expenses.length > visibleCount

  const handleShowMore = () => {
    setVisibleCount((prev) => prev + 10)
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Recent Expenses</h2>
      {deleteError && (
        <div className="mb-3 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {deleteError}
        </div>
      )}
      {visibleExpenses.map((expense) => {
        const category = expense.category_id
          ? categories.get(expense.category_id)
          : null
        const account = expense.account_id
          ? accounts.get(expense.account_id)
          : null

        const isShowingDelete = showingDeleteId === expense.id
        const isDeleting = deletingIds.has(expense.id)

        return (
          <div
            key={expense.id}
            className={`overflow-hidden transition-all duration-300 ${
              isDeleting ? 'max-h-0 opacity-0 mb-0' : 'max-h-96 opacity-100 mb-3'
            }`}
          >
            <div
              className={`transition-all duration-300 ${
                isDeleting ? 'scale-95 -translate-x-4' : 'scale-100 translate-x-0'
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
                    <span className="font-medium">{category?.name || "Uncategorized"}</span>
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
                    {account && (
                      <>
                        <span>•</span>
                        <span>{account.name}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="relative flex items-start">
                  {/* Amount */}
                  <div className={`text-right transition-all ${isShowingDelete ? 'mr-10' : 'md:group-hover:mr-10'}`}>
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
                        ? 'opacity-100 pointer-events-auto'
                        : 'opacity-0 pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto'
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

      {/* Show More Button */}
      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={handleShowMore}
            className="px-6 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-accent transition-colors"
          >
            Show More
          </button>
        </div>
      )}
    </div>
  )
}
