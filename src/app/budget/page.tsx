"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import type { BudgetSummary } from "@/lib/types"
import { BudgetSummaryCard } from "@/components/budget-summary-card"
import { BudgetCategoryCard } from "@/components/budget-category-card"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"

export default function BudgetPage() {
  const router = useRouter()
  const [userName, setUserName] = useState<string>("")
  const [budgets, setBudgets] = useState<BudgetSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState("")

  useEffect(() => {
    const supabase = createClient()

    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { data: userData } = await supabase
          .from("users")
          .select("full_name")
          .eq("id", user.id)
          .single()

        if (userData?.full_name) {
          setUserName(userData.full_name)
        } else {
          setUserName(user.email?.split("@")[0] || "")
        }
      }
    }

    const loadBudgets = async () => {
      // Get first day of current month in local timezone (avoid UTC conversion)
      const now = new Date()
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      const budgetMonth = format(firstDay, "yyyy-MM-dd")

      setCurrentMonth(format(firstDay, "MMMM yyyy"))

      const { data, error } = await supabase
        .from("budget_summary")
        .select("*")
        .eq("budget_month", budgetMonth)
        .eq("category_type", "monthly")
        .order("category_name", { ascending: true })

      if (error) {
        console.error("Error loading budgets:", error)
      } else if (data) {
        setBudgets(data)
      }

      setLoading(false)
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
          loadBudgets()
        }
      )
      .subscribe()

    loadUser()
    loadBudgets()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

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
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Quick Budget</h1>
            {userName && (
              <p className="text-sm text-muted-foreground">
                Welcome, {userName}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push("/expenses")}>
              Expenses
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              Log Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Page Title */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            Budget Overview - {currentMonth}
          </h2>
          <Button onClick={() => router.push("/expenses")}>
            Add Expense
          </Button>
        </div>

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
