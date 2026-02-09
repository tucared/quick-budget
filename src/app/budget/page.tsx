"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { useUser } from "@/lib/hooks/use-user"
import type { BudgetSummary } from "@/lib/types"
import { BudgetSummaryCard } from "@/components/budget-summary-card"
import { BudgetCategoryCard } from "@/components/budget-category-card"
import { BudgetBurndownChart } from "@/components/budget-burndown-chart"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { getCurrentBudgetMonth } from "@/lib/date-utils"

export default function BudgetPage() {
  const router = useRouter()
  const { user } = useUser()
  const [budgets, setBudgets] = useState<BudgetSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState("")
  const [budgetMonth, setBudgetMonth] = useState("")

  useEffect(() => {
    const supabase = createClient()

    const loadBudgets = async (householdId: string) => {
      // Get first day of current month in local timezone
      const budgetMonth = getCurrentBudgetMonth()
      const now = new Date()

      setCurrentMonth(format(now, "MMMM yyyy"))
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

    // Only load budgets if user is loaded
    if (!user?.householdId) {
      setLoading(false)
      return
    }

    // Set up real-time subscription to expenses table
    // When expenses change, reload budgets to update spent amounts
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
          // Reload budgets when any expense is added/updated/deleted
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

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="container mx-auto px-4 py-3">
          {/* Top row: Title left, Welcome right - mobile friendly */}
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold whitespace-nowrap">Quick Budget</h1>
            {user && (
              <p className="text-sm text-muted-foreground whitespace-nowrap">
                Welcome, {user.fullName}
              </p>
            )}
          </div>
          {/* Bottom row: Navigation buttons */}
          <div className="flex items-center gap-2 justify-center">
            <Button variant="outline" onClick={() => router.push("/expenses")}>
              Expenses
            </Button>
            <Button variant="default" disabled>
              Budget
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              Log Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
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
    </div>
  )
}
