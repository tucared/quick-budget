"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase"
import { format, startOfMonth } from "date-fns"
import { Pencil, ArrowRightLeft } from "lucide-react"
import type { BudgetSummary, Expense, Category } from "@/lib/types"
import { BudgetSummaryCard } from "@/components/budget-summary-card"
import { BudgetCategoryCard } from "@/components/budget-category-card"
import { BudgetBurndownChartClient } from "@/components/budget-burndown-chart-client"
import { MonthNavigator } from "@/components/month-navigator"
import { BudgetEditDialog } from "@/components/budget-edit-dialog"
import { RebalanceDialog } from "@/components/rebalance-dialog"
import { CategoryExpenseDialog } from "@/components/category-expense-dialog"
import { Button } from "@/components/ui/button"
import { useExpenseSubscription } from "@/lib/hooks/use-expense-subscription"
import { getErrorMessage } from "@/lib/error-handler"

interface BudgetPageContentProps {
  initialBudgets: BudgetSummary[]
  initialAllowances: BudgetSummary[]
  initialExpenses: Expense[]
  categories: Category[]
  householdId: string
  budgetMonth: string
}

export function BudgetPageContent({
  initialBudgets,
  initialAllowances,
  initialExpenses,
  categories,
  householdId,
  budgetMonth,
}: BudgetPageContentProps) {
  const [budgets, setBudgets] = useState<BudgetSummary[]>(initialBudgets)
  const [allowances, setAllowances] = useState<BudgetSummary[]>(initialAllowances)
  const [error, setError] = useState("")
  const [editOpen, setEditOpen] = useState(false)
  const [rebalanceOpen, setRebalanceOpen] = useState(false)
  const [selectedBudget, setSelectedBudget] = useState<BudgetSummary | null>(null)
  const [categoryExpenseDialogOpen, setCategoryExpenseDialogOpen] = useState(false)

  const isCurrentMonth =
    format(startOfMonth(new Date()), "yyyy-MM-dd") === budgetMonth

  // Update budgets and allowances when initial data changes (e.g. month navigation via server)
  useEffect(() => {
    setBudgets(initialBudgets)
  }, [initialBudgets])

  useEffect(() => {
    setAllowances(initialAllowances)
  }, [initialAllowances])

  // Reload budgets when expenses change (real-time updates)
  useExpenseSubscription(
    () => {
      const supabase = createClient()

      supabase
        .from("budget_summary")
        .select("*")
        .eq("household_id", householdId)
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

      supabase
        .from("budget_summary")
        .select("*")
        .eq("household_id", householdId)
        .eq("budget_month", budgetMonth)
        .eq("exclude_from_budget_total", true)
        .order("category_name", { ascending: true })
        .then(({ data, error: reloadError }) => {
          if (reloadError) {
            setError(getErrorMessage(reloadError))
          } else if (data) {
            setAllowances(data)
          }
        })
    },
    true
  )

  const handleCategoryClick = (budget: BudgetSummary) => {
    setSelectedBudget(budget)
    setCategoryExpenseDialogOpen(true)
  }

  const isEmpty = budgets.length === 0

  return (
    <>
      {/* Header with month nav and action buttons */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <MonthNavigator budgetMonth={budgetMonth} />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="h-4 w-4 mr-1" />
            {isEmpty ? "Set Budget" : "Edit Budget"}
          </Button>
          {isCurrentMonth && !isEmpty && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRebalanceOpen(true)}
            >
              <ArrowRightLeft className="h-4 w-4 mr-1" />
              Rebalance
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {error}
        </div>
      )}

      {isEmpty ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-lg font-medium mb-2">No budget set for this month</p>
          <p className="text-sm mb-4">
            Set up your budget allocations to start tracking spending.
          </p>
          <Button onClick={() => setEditOpen(true)}>Set Budget</Button>
        </div>
      ) : (
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
                <BudgetCategoryCard
                  key={budget.id}
                  budget={budget}
                  onClick={handleCategoryClick}
                />
              ))}
            </div>
          </div>

          {/* Allowances Grid */}
          {allowances.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Allowances</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allowances.map((allowance) => (
                  <BudgetCategoryCard
                    key={allowance.id}
                    budget={allowance}
                    onClick={handleCategoryClick}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Budget Dialog */}
      <BudgetEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        categories={categories}
        householdId={householdId}
        budgetMonth={budgetMonth}
      />

      {/* Rebalance Dialog */}
      <RebalanceDialog
        open={rebalanceOpen}
        onOpenChange={setRebalanceOpen}
        budgets={budgets}
        householdId={householdId}
        budgetMonth={budgetMonth}
      />

      {/* Category Expense Detail Dialog */}
      <CategoryExpenseDialog
        open={categoryExpenseDialogOpen}
        onOpenChange={setCategoryExpenseDialogOpen}
        budget={selectedBudget}
        householdId={householdId}
        budgetMonth={budgetMonth}
        allExpenses={initialExpenses}
        categories={categories}
      />
    </>
  )
}
