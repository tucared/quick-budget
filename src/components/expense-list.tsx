"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { createClient } from "@/lib/supabase"
import type { ExpenseWithDetails, Category, Account } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function ExpenseList() {
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>([])
  const [categories, setCategories] = useState<Map<string, Category>>(new Map())
  const [accounts, setAccounts] = useState<Map<string, Account>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    // Load categories and accounts for lookup
    const loadReferenceData = async () => {
      // Get user's household_id for explicit filtering
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setLoading(false)
        return
      }

      const { data: userData } = await supabase
        .from("users")
        .select("household_id")
        .eq("id", user.id)
        .single()

      if (!userData?.household_id) {
        setLoading(false)
        return
      }

      const householdId = userData.household_id

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
          }
        }
      )
      .subscribe()

    loadReferenceData()

    // Cleanup subscription
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

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
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Recent Expenses</h2>
      {expenses.map((expense) => {
        const category = expense.category_id
          ? categories.get(expense.category_id)
          : null
        const account = expense.account_id
          ? accounts.get(expense.account_id)
          : null

        return (
          <Card key={expense.id}>
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
                <div className="text-right flex-shrink-0">
                  <div className="font-semibold text-lg">
                    €{expense.converted_amount.toFixed(2)}
                  </div>
                  {expense.currency !== "EUR" && (
                    <div className="text-xs text-muted-foreground">
                      {expense.currency} {expense.amount.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
