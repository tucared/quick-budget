"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase"
import { useUser } from "@/lib/contexts/user-context"
import type { BudgetSummary } from "@/lib/types"
import { BudgetSummaryCard } from "@/components/budget-summary-card"
import { BudgetCategoryCard } from "@/components/budget-category-card"
import { BudgetBurndownChart } from "@/components/budget-burndown-chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { getCurrentBudgetMonth } from "@/lib/date-utils"
import { useExpenseSubscription } from "@/lib/hooks/use-expense-subscription"
import { getErrorMessage } from "@/lib/error-handler"

export default function BudgetPage() {
  const { user } = useUser()
  const [budgets, setBudgets] = useState<BudgetSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [budgetMonth, setBudgetMonth] = useState("")
  const [error, setError] = useState("")

  // Load budget data
  useEffect(() => {
    const supabase = createClient()

    const loadBudgets = async (householdId: string) => {
      const budgetMonth = getCurrentBudgetMonth()
      setBudgetMonth(budgetMonth)

      const { data, error: loadError } = await supabase
        .from("budget_summary")
        .select("*")
        .eq("household_id", householdId)
        .eq("budget_month", budgetMonth)
        .eq("exclude_from_budget_total", false)
        .order("category_name", { ascending: true })

      if (loadError) {
        setError(getErrorMessage(loadError))
      } else if (data) {
        setBudgets(data)
      }

      setLoading(false)
    }

    if (!user?.householdId) {
      setLoading(false)
      return
    }

    loadBudgets(user.householdId)
  }, [user])

  // Reload budgets when expenses change
  useExpenseSubscription(
    () => {
      if (user?.householdId) {
        const supabase = createClient()
        const budgetMonth = getCurrentBudgetMonth()

        supabase
          .from("budget_summary")
          .select("*")
          .eq("household_id", user.householdId)
          .eq("budget_month", budgetMonth)
          .eq("exclude_from_budget_total", false)
          .order("category_name", { ascending: true })
          .then(({ data, error: reloadError }) => {
            if (reloadError) {
              setError(getErrorMessage(reloadError))
            } else if (data) {
              setBudgets(data)
            }
          })
      }
    },
    !!user?.householdId
  )

  return (
    <main className="container mx-auto px-4 py-6 max-w-6xl">
      {error && (
        <div className="mb-6 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {error}
        </div>
      )}
      {loading ? (
        <div className="space-y-6">
          {/* Total Budget Summary Skeleton */}
          <Card className="border">
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {/* Amount grid skeleton */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <Skeleton className="h-3 w-16 mx-auto mb-1" />
                    <Skeleton className="h-6 w-20 mx-auto" />
                  </div>
                  <div>
                    <Skeleton className="h-3 w-16 mx-auto mb-1" />
                    <Skeleton className="h-6 w-20 mx-auto" />
                  </div>
                  <div>
                    <Skeleton className="h-3 w-20 mx-auto mb-1" />
                    <Skeleton className="h-6 w-20 mx-auto" />
                  </div>
                </div>
                {/* Progress bar skeleton */}
                <div className="space-y-1.5">
                  <Skeleton className="h-2 w-full rounded-full" />
                  <div className="flex justify-between">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Burndown Chart Skeleton */}
          <Card className="border">
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>

          {/* Category Budgets Grid Skeleton */}
          <div>
            <Skeleton className="h-6 w-24 mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    {/* Category header skeleton */}
                    <div className="flex items-center gap-2 mb-3">
                      <Skeleton className="h-8 w-8 rounded" />
                      <Skeleton className="h-5 flex-1" />
                      <Skeleton className="h-4 w-12" />
                    </div>
                    {/* Progress bar skeleton */}
                    <Skeleton className="h-2.5 w-full rounded-full mb-3" />
                    {/* Amount details skeleton */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <Skeleton className="h-3 w-16 mx-auto mb-1" />
                        <Skeleton className="h-5 w-14 mx-auto" />
                      </div>
                      <div>
                        <Skeleton className="h-3 w-12 mx-auto mb-1" />
                        <Skeleton className="h-5 w-14 mx-auto" />
                      </div>
                      <div>
                        <Skeleton className="h-3 w-16 mx-auto mb-1" />
                        <Skeleton className="h-5 w-14 mx-auto" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
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
