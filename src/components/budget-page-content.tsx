"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase"
import { format, startOfMonth } from "date-fns"
import { Pencil, Plus } from "lucide-react"
import type { BudgetSummary, Expense, Category } from "@/lib/types"
import { BudgetSummaryCard } from "@/components/budget-summary-card"
import { BudgetBurndownChartClient } from "@/components/budget-burndown-chart-client"
import { formatCurrency } from "@/lib/currency"
import { getBudgetProgressBarColor, getBudgetStatusColor } from "@/lib/budget-utils"
import { MonthNavigator } from "@/components/month-navigator"
import { BudgetEditDialog } from "@/components/budget-edit-dialog"
import { RebalanceDialog } from "@/components/rebalance-dialog"
import { CategoryExpenseDialog } from "@/components/category-expense-dialog"
import { Button } from "@/components/ui/button"
import { useExpenseSubscription } from "@/lib/hooks/use-expense-subscription"
import { useBudgetAllocationSubscription } from "@/lib/hooks/use-budget-allocation-subscription"
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
  const [rebalanceDestId, setRebalanceDestId] = useState<string | null>(null)
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

  function reloadBudgets() {
    const supabase = createClient()
    supabase
      .from("budget_summary")
      .select("*")
      .eq("household_id", householdId)
      .eq("budget_month", budgetMonth)
      .eq("exclude_from_budget_total", false)
      .order("category_name", { ascending: true })
      .then(({ data, error: reloadError }) => {
        if (reloadError) setError(getErrorMessage(reloadError))
        else if (data) setBudgets(data)
      })
    supabase
      .from("budget_summary")
      .select("*")
      .eq("household_id", householdId)
      .eq("budget_month", budgetMonth)
      .eq("exclude_from_budget_total", true)
      .order("category_name", { ascending: true })
      .then(({ data, error: reloadError }) => {
        if (reloadError) setError(getErrorMessage(reloadError))
        else if (data) setAllowances(data)
      })
  }

  // Reload budgets when expenses or budget allocations change (real-time)
  useExpenseSubscription(reloadBudgets, true)
  useBudgetAllocationSubscription(reloadBudgets, true)

  const handleCategoryClick = (budget: BudgetSummary) => {
    setSelectedBudget(budget)
    setCategoryExpenseDialogOpen(true)
  }

  const handleAddFunds = (e: React.MouseEvent, budget: BudgetSummary) => {
    e.stopPropagation()
    setRebalanceDestId(budget.category_id)
    setRebalanceOpen(true)
  }

  const isEmpty = budgets.length === 0

  return (
    <>
      {/* Header with month nav and action buttons */}
      <div className="flex items-center justify-between gap-2 mb-6">
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

          {/* Category Budgets */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Categories</h3>
            <div className="divide-y rounded-lg border">
              {budgets.map((budget) => (
                <CategoryRow
                  key={budget.id}
                  budget={budget}
                  isCurrentMonth={isCurrentMonth}
                  onClick={handleCategoryClick}
                  onAddFunds={handleAddFunds}
                />
              ))}
            </div>
          </div>

          {/* Allowances */}
          {allowances.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Allowances</h3>
              <div className="divide-y rounded-lg border">
                {allowances.map((allowance) => (
                  <CategoryRow
                    key={allowance.id}
                    budget={allowance}
                    isCurrentMonth={isCurrentMonth}
                    onClick={handleCategoryClick}
                    onAddFunds={handleAddFunds}
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
        onSuccess={reloadBudgets}
        categories={categories}
        householdId={householdId}
        budgetMonth={budgetMonth}
      />

      {/* Rebalance Dialog */}
      <RebalanceDialog
        open={rebalanceOpen}
        onOpenChange={(v) => { setRebalanceOpen(v); if (!v) setRebalanceDestId(null) }}
        onSuccess={reloadBudgets}
        budgets={budgets}
        householdId={householdId}
        budgetMonth={budgetMonth}
        initialDestId={rebalanceDestId}
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

interface CategoryRowProps {
  budget: BudgetSummary
  isCurrentMonth: boolean
  onClick: (budget: BudgetSummary) => void
  onAddFunds: (e: React.MouseEvent, budget: BudgetSummary) => void
}

function CategoryRow({ budget, isCurrentMonth, onClick, onAddFunds }: CategoryRowProps) {
  const percentSpent = Number(budget.percent_spent)
  const remaining = Number(budget.remaining_amount)
  const isOver = remaining < 0

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 cursor-pointer transition-colors first:rounded-t-lg last:rounded-b-lg"
      onClick={() => onClick(budget)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(budget) } }}
    >
      {budget.category_icon && (
        <span className="text-base shrink-0 w-5 text-center">{budget.category_icon}</span>
      )}
      <span className="text-sm font-medium flex-1 min-w-0 truncate">{budget.category_name}</span>
      <div className="w-24 shrink-0 hidden sm:block">
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${getBudgetProgressBarColor(percentSpent)}`}
            style={{ width: `${Math.min(percentSpent, 100)}%` }}
          />
        </div>
      </div>
      {isCurrentMonth && isOver && (
        <button
          onClick={(e) => onAddFunds(e, budget)}
          className="shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors"
          title="Add funds from another category"
        >
          <Plus className="h-3 w-3" />
          Add funds
        </button>
      )}
      <span className={`text-sm font-medium shrink-0 w-20 text-right ${getBudgetStatusColor(percentSpent)}`}>
        {formatCurrency(remaining, 0)}
      </span>
    </div>
  )
}
