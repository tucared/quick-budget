"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase"
import { format, startOfMonth, getDaysInMonth } from "date-fns"
import { Pencil } from "lucide-react"
import type { BudgetSummary, Expense, Category } from "@/lib/types"
import { BudgetSummaryCard } from "@/components/budget-summary-card"
import dynamic from "next/dynamic"

const BudgetBurndownChartClient = dynamic(
  () => import("@/components/budget-burndown-chart-client").then((mod) => mod.BudgetBurndownChartClient),
  { ssr: false }
)
import { CategoryBudgetCard } from "@/components/category-budget-card"
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
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses)
  const [error, setError] = useState("")
  const [editOpen, setEditOpen] = useState(false)
  const [rebalanceOpen, setRebalanceOpen] = useState(false)
  const [rebalanceDestId, setRebalanceDestId] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [categoryExpenseDialogOpen, setCategoryExpenseDialogOpen] = useState(false)
  const selectedBudget = selectedCategoryId
    ? ([...budgets, ...allowances].find((b) => b.category_id === selectedCategoryId) ?? null)
    : null

  const isCurrentMonth =
    format(startOfMonth(new Date()), "yyyy-MM-dd") === budgetMonth

  // Update state when initial data changes (e.g. month navigation via server)
  useEffect(() => { setBudgets(initialBudgets) }, [initialBudgets])
  useEffect(() => { setAllowances(initialAllowances) }, [initialAllowances])
  useEffect(() => { setExpenses(initialExpenses) }, [initialExpenses])

  function reloadBudgets() {
    const supabase = createClient()
    Promise.all([
      supabase
        .from("budget_summary")
        .select("*")
        .eq("household_id", householdId)
        .eq("budget_month", budgetMonth)
        .eq("exclude_from_budget_total", false)
        .order("category_name", { ascending: true }),
      supabase
        .from("budget_summary")
        .select("*")
        .eq("household_id", householdId)
        .eq("budget_month", budgetMonth)
        .eq("exclude_from_budget_total", true)
        .order("category_name", { ascending: true }),
    ]).then(([budgetResult, allowanceResult]) => {
      if (budgetResult.error) setError(getErrorMessage(budgetResult.error))
      else if (budgetResult.data) setBudgets(budgetResult.data)
      if (allowanceResult.error) setError(getErrorMessage(allowanceResult.error))
      else if (allowanceResult.data) setAllowances(allowanceResult.data)
    })
  }

  // Apply expense changes optimistically so there's no reload flash
  useExpenseSubscription((event) => {
    // Helper: recompute derived budget fields after mutating spent_amount
    function recompute(b: BudgetSummary): BudgetSummary {
      const remaining = Number(b.allocated_amount) - Number(b.spent_amount)
      const percent =
        Number(b.allocated_amount) > 0
          ? (Number(b.spent_amount) / Number(b.allocated_amount)) * 100
          : 0
      return { ...b, remaining_amount: remaining, percent_spent: percent }
    }

    // Helper: apply a delta to the matching category row
    function applyDelta(
      list: BudgetSummary[],
      categoryId: string | null | undefined,
      delta: number
    ): BudgetSummary[] {
      if (!categoryId) return list
      return list.map((b) =>
        b.category_id === categoryId
          ? recompute({ ...b, spent_amount: Number(b.spent_amount) + delta })
          : b
      )
    }

    // With RLS enabled, DELETE events only contain the primary key in `old`.
    // Look up the full expense from local state to get amount/category.
    if (event.type === "DELETE") {
      const oldId = (event.old as { id: string }).id
      // Capture the deleted expense before removing it from state.
      // setBudgets/setAllowances must be called OUTSIDE the setExpenses
      // updater — React StrictMode double-invokes updater functions, which
      // would apply the delta twice if nested inside.
      let deleted: Expense | undefined
      setExpenses((prev) => {
        deleted = prev.find((e) => e.id === oldId)
        return prev.filter((e) => e.id !== oldId)
      })
      if (deleted) {
        const delta = -Number(deleted.converted_amount)
        setBudgets((b) => applyDelta(b, deleted!.category_id, delta))
        setAllowances((a) => applyDelta(a, deleted!.category_id, delta))
      }
      return
    }

    const expense = event.new as Expense | undefined
    if (!expense) return

    // Only apply changes for the current budget month
    if (!expense.expense_date) return
    const expenseMonth = format(startOfMonth(new Date(expense.expense_date + "T00:00:00")), "yyyy-MM-dd")
    if (expenseMonth !== budgetMonth) return

    if (event.type === "INSERT") {
      const newExpense = event.new as Expense
      setExpenses((prev) => {
        if (prev.some((e) => e.id === newExpense.id)) return prev
        return [...prev, newExpense]
      })
      const delta = Number(newExpense.converted_amount)
      setBudgets((prev) => applyDelta(prev, newExpense.category_id, delta))
      setAllowances((prev) => applyDelta(prev, newExpense.category_id, delta))
    } else if (event.type === "UPDATE") {
      const oldExpense = event.old as Expense
      const newExpense = event.new as Expense
      setExpenses((prev) => prev.map((e) => (e.id === newExpense.id ? newExpense : e)))
      const delta = Number(newExpense.converted_amount) - Number(oldExpense.converted_amount)
      // Also handle category reassignment
      if (oldExpense.category_id !== newExpense.category_id) {
        setBudgets((prev) =>
          applyDelta(applyDelta(prev, oldExpense.category_id, -Number(oldExpense.converted_amount)), newExpense.category_id, Number(newExpense.converted_amount))
        )
        setAllowances((prev) =>
          applyDelta(applyDelta(prev, oldExpense.category_id, -Number(oldExpense.converted_amount)), newExpense.category_id, Number(newExpense.converted_amount))
        )
      } else {
        setBudgets((prev) => applyDelta(prev, newExpense.category_id, delta))
        setAllowances((prev) => applyDelta(prev, newExpense.category_id, delta))
      }
    }
  }, true)
  useBudgetAllocationSubscription(reloadBudgets, true)

  const handleCategoryClick = (budget: BudgetSummary) => {
    setSelectedCategoryId(budget.category_id)
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
          <BudgetSummaryCard
            budgets={budgets}
            dayOfMonth={isCurrentMonth ? new Date().getDate() : undefined}
            daysInMonth={isCurrentMonth ? getDaysInMonth(new Date()) : undefined}
          />

          {/* Burndown Chart */}
          <BudgetBurndownChartClient
            budgets={budgets}
            currentMonth={budgetMonth}
            initialExpenses={expenses}
          />

          {/* Category Budgets */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Categories</h3>
            <div className="space-y-2">
              {budgets.map((budget) => (
                <CategoryBudgetCard
                  key={budget.id}
                  budget={budget}
                  showHeader
                  isCurrentMonth={isCurrentMonth}
                  dayOfMonth={isCurrentMonth ? new Date().getDate() : undefined}
                  daysInMonth={isCurrentMonth ? getDaysInMonth(new Date()) : undefined}
                  onClick={() => handleCategoryClick(budget)}
                  onAddFunds={(e) => handleAddFunds(e, budget)}
                />
              ))}
            </div>
          </div>

          {/* Allowances */}
          {allowances.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Allowances</h3>
              <div className="space-y-2">
                {allowances.map((allowance) => (
                  <CategoryBudgetCard
                    key={allowance.id}
                    budget={allowance}
                    showHeader
                    isCurrentMonth={isCurrentMonth}
                    dayOfMonth={isCurrentMonth ? new Date().getDate() : undefined}
                    daysInMonth={isCurrentMonth ? getDaysInMonth(new Date()) : undefined}
                    onClick={() => handleCategoryClick(allowance)}
                    onAddFunds={(e) => handleAddFunds(e, allowance)}
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
        budgets={[...budgets, ...allowances]}
        householdId={householdId}
        budgetMonth={budgetMonth}
        initialDestId={rebalanceDestId}
      />

      {/* Category Expense Detail Dialog */}
      <CategoryExpenseDialog
        open={categoryExpenseDialogOpen}
        onOpenChange={setCategoryExpenseDialogOpen}
        budget={selectedBudget}
        budgetMonth={budgetMonth}
        allExpenses={expenses}
        categories={categories}
      />
    </>
  )
}

