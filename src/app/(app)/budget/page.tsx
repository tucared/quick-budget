"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase"
import { useUser } from "@/lib/contexts/user-context"
import type { BudgetSummary } from "@/lib/types"
import { BudgetSummaryCard } from "@/components/budget-summary-card"
import { BudgetCategoryCard } from "@/components/budget-category-card"
import { BudgetBurndownChart } from "@/components/budget-burndown-chart"
import { getCurrentBudgetMonth } from "@/lib/date-utils"

export default function BudgetPage() {
  const { user } = useUser()
  const [budgets, setBudgets] = useState<BudgetSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [budgetMonth, setBudgetMonth] = useState("")

  useEffect(() => {
    const supabase = createClient()

    const loadBudgets = async (householdId: string) => {
      const budgetMonth = getCurrentBudgetMonth()
      setBudgetMonth(budgetMonth)

      const { data, error } = await supabase
        .from("budget_summary")
        .select("*")
        .eq("household_id", householdId)
        .eq("budget_month", budgetMonth)
        .eq("exclude_from_budget_total", false)
        .order("category_name", { ascending: true })

      if (error) {
        console.error("Error loading budgets:", error)
      } else if (data) {
        setBudgets(data)
      }

      setLoading(false)
    }

    if (!user?.householdId) {
      setLoading(false)
      return
    }

    const channel = supabase
      .channel("budget_expenses_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expenses",
        },
        () => {
          if (user?.householdId) {
            loadBudgets(user.householdId)
          }
        }
      )
      .subscribe()

    loadBudgets(user.householdId)

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  return (
    <main className="container mx-auto px-4 py-6 max-w-6xl">
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading budget...
        </div>
      ) : budgets.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-lg font-medium mb-2">No budget set for this month</p>
          <p className="text-sm">
            Budget allocations will appear here once configured
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Total Budget Summary */}
          <BudgetSummaryCard budgets={budgets} />

          {/* Burndown Chart */}
          {user?.householdId && budgetMonth && (
            <BudgetBurndownChart
              budgets={budgets}
              householdId={user.householdId}
              currentMonth={budgetMonth}
            />
          )}

          {/* Category Budgets Grid */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Categories</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {budgets.map((budget) => (
                <BudgetCategoryCard key={budget.id} budget={budget} />
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
