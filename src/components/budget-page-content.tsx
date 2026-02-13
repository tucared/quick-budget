"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase"
import type { BudgetSummary, Expense } from "@/lib/types"
import { BudgetSummaryCard } from "@/components/budget-summary-card"
import { BudgetCategoryCard } from "@/components/budget-category-card"
import { BudgetBurndownChartClient } from "@/components/budget-burndown-chart-client"
import { Card, CardContent } from "@/components/ui/card"
import { getCurrentBudgetMonth } from "@/lib/date-utils"
import { useExpenseSubscription } from "@/lib/hooks/use-expense-subscription"
import { getErrorMessage } from "@/lib/error-handler"

interface BudgetPageContentProps {
  initialBudgets: BudgetSummary[]
  initialExpenses: Expense[]
  householdId: string
  budgetMonth: string
}

export function BudgetPageContent({
  initialBudgets,
  initialExpenses,
  householdId,
  budgetMonth,
}: BudgetPageContentProps) {
  const [budgets, setBudgets] = useState<BudgetSummary[]>(initialBudgets)
  const [error, setError] = useState("")

  // Update budgets when initial data changes (shouldn't happen often)
  useEffect(() => {
    setBudgets(initialBudgets)
  }, [initialBudgets])

  // Reload budgets when expenses change (real-time updates)
  useExpenseSubscription(
    () => {
      const supabase = createClient()
      const currentBudgetMonth = getCurrentBudgetMonth()

      supabase
        .from("budget_summary")
        .select("*")
        .eq("household_id", householdId)
        .eq("budget_month", currentBudgetMonth)
        .eq("exclude_from_budget_total", false)
        .order("category_name", { ascending: true })
        .then(({ data, error: reloadError }) => {
          if (reloadError) {
            setError(getErrorMessage(reloadError))
          } else if (data) {
            setBudgets(data)
          }
        })
    },
    true
  )

  if (budgets.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-lg font-medium mb-2">No budget set for this month</p>
        <p className="text-sm">
          Budget allocations will appear here once configured
        </p>
      </div>
    )
  }

  return (
    <>
      {error && (
        <div className="mb-6 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {error}
        </div>
      )}
      <div className="space-y-6">
        {/* Total Budget Summary */}
        <BudgetSummaryCard budgets={budgets} />

        {/* Burndown Chart */}
        <BudgetBurndownChartClient
          budgets={budgets}
          householdId={householdId}
          currentMonth={budgetMonth}
          initialExpenses={initialExpenses}
        />

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
    </>
  )
}
