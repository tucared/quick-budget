"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase"
import type { ExpenseWithDetails, Category, Account } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/currency"
import { useUser } from "@/lib/contexts/user-context"

export function ExpenseList() {
  const { user } = useUser()
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>([])
  const [categories, setCategories] = useState<Map<string, Category>>(new Map())
  const [accounts, setAccounts] = useState<Map<string, Account>>(new Map())
  const [loading, setLoading] = useState(true)
  const [showingDeleteId, setShowingDeleteId] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  const handleCardClick = (expenseId: string) => {
    // Toggle delete button visibility on mobile
    setShowingDeleteId(showingDeleteId === expenseId ? null : expenseId)
  }

  const handleDelete = async (expenseId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card click from firing
    setDeletingIds((prev) => new Set(prev).add(expenseId))
    setShowingDeleteId(null)

    const supabase = createClient()
    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", expenseId)

    if (error) {
      console.error("Error deleting expense:", error)
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(expenseId)
        return next
      })
    }
  }

  useEffect(() => {
    const supabase = createClient()

    // Load categories and accounts for lookup
    const loadReferenceData = async () => {
      if (!user?.householdId) {
        setLoading(false)
        return
      }

      const householdId = user.householdId

      const { data: categoriesData } = await supabase
        .from("categories")
        .select("*")
        .eq("household_id", householdId)

      const { data: accountsData } = await supabase
        .from("accounts")
        .select("*")
        .eq("household_id", householdId)

      if (categoriesData) {
        const catMap = new Map<string, Category>()
        categoriesData.forEach((cat) => catMap.set(cat.id, cat))
        setCategories(catMap)
      }

      if (accountsData) {
        const accMap = new Map<string, Account>()
        accountsData.forEach((acc) => accMap.set(acc.id, acc))
        setAccounts(accMap)
      }

      // Load expenses with explicit household filter
      const { data } = await supabase
        .from("expenses")
        .select("*")
        .eq("household_id", householdId)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20)

      if (data) {
        setExpenses(data)
      }
      setLoading(false)
    }

    // Set up real-time subscription
    const channel = supabase
      .channel("expenses_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expenses",
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            // Add new expense to the top of the list
            setExpenses((prev) => [payload.new as ExpenseWithDetails, ...prev.slice(0, 19)])
          } else if (payload.eventType === "UPDATE") {
            // Update existing expense
            setExpenses((prev) =>
              prev.map((exp) =>
                exp.id === payload.new.id ? (payload.new as ExpenseWithDetails) : exp
              )
            )
          } else if (payload.eventType === "DELETE") {
            // Remove deleted expense
            setExpenses((prev) => prev.filter((exp) => exp.id !== payload.old.id))
            setDeletingIds((prev) => {
              const next = new Set(prev)
              next.delete(payload.old.id)
              return next
            })
          }
        }
      )
      .subscribe()

    loadReferenceData()

    // Cleanup subscription
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading expenses...
      </div>
    )
  }

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

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Recent Expenses</h2>
      {expenses.map((expense) => {
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
                        {expense.currency} {formatCurrency(expense.amount).replace('€', '')}
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
    </div>
  )
}
