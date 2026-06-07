"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase"
import { startOfMonth, getDaysInMonth, format } from "date-fns"
import { Pencil } from "lucide-react"
import type { BudgetSummary, Expense, Category, MonthlyBudgetTarget } from "@/lib/types"
import {
  fetchBudgetAndAllowanceSummary,
  fetchMonthlyBudgetTarget,
  fetchMonthlyExpenses,
} from "@/lib/client/data"
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
  initialTarget: MonthlyBudgetTarget | null
  initialExpenses: Expense[]
  categories: Category[]
  householdId: string
  budgetMonth: string
  /** expense id → tricount title for rows mirrored by sync (read-only in the drill-down). */
  syncedExpenseTitles?: Record<string, string>
}

export function BudgetPageContent({
  initialBudgets,
  initialAllowances,
  initialTarget,
  initialExpenses,
  categories,
  householdId,
  budgetMonth,
  syncedExpenseTitles,
}: BudgetPageContentProps) {
  const [budgets, setBudgets] = useState<BudgetSummary[]>(initialBudgets)
  const [allowances, setAllowances] = useState<BudgetSummary[]>(initialAllowances)
  const [target, setTarget] = useState<MonthlyBudgetTarget | null>(initialTarget)
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

  // Sync SSR-provided props into local state when the parent passes new data (e.g. month navigation).
  // These synchronous setState calls are intentional: local state is also updated via real-time
  // subscriptions, so we can't eliminate it in favour of using props directly.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setBudgets(initialBudgets) }, [initialBudgets])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setAllowances(initialAllowances) }, [initialAllowances])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTarget(initialTarget) }, [initialTarget])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setExpenses(initialExpenses) }, [initialExpenses])

  function reloadData() {
    const supabase = createClient()
    Promise.all([
      fetchBudgetAndAllowanceSummary(supabase, householdId, budgetMonth),
      fetchMonthlyBudgetTarget(supabase, householdId, budgetMonth),
      fetchMonthlyExpenses(supabase, householdId, budgetMonth),
    ]).then(([summaryResult, targetResult, expensesResult]) => {
      if (summaryResult.error) setError(getErrorMessage(summaryResult.error))
      else if (summaryResult.data) {
        setBudgets(summaryResult.data.budgets)
        setAllowances(summaryResult.data.allowances)
      }
      if (targetResult.error) setError(getErrorMessage(targetResult.error))
      else setTarget(targetResult.data)
      if (expensesResult.error) setError(getErrorMessage(expensesResult.error))
      else if (expensesResult.data) setExpenses(expensesResult.data)
    })
  }

  function reloadExpenses() {
    const supabase = createClient()
    Promise.all([
      fetchBudgetAndAllowanceSummary(supabase, householdId, budgetMonth),
      fetchMonthlyExpenses(supabase, householdId, budgetMonth),
    ]).then(([summaryResult, expensesResult]) => {
      if (summaryResult.error) setError(getErrorMessage(summaryResult.error))
      else if (summaryResult.data) {
        setBudgets(summaryResult.data.budgets)
        setAllowances(summaryResult.data.allowances)
      }
      if (expensesResult.error) setError(getErrorMessage(expensesResult.error))
      else if (expensesResult.data) setExpenses(expensesResult.data)
    })
  }

  function reloadAllocations() {
    const supabase = createClient()
    Promise.all([
      fetchBudgetAndAllowanceSummary(supabase, householdId, budgetMonth),
      fetchMonthlyBudgetTarget(supabase, householdId, budgetMonth),
    ]).then(([summaryResult, targetResult]) => {
      if (summaryResult.error) setError(getErrorMessage(summaryResult.error))
      else if (summaryResult.data) {
        setBudgets(summaryResult.data.budgets)
        setAllowances(summaryResult.data.allowances)
      }
      if (targetResult.error) setError(getErrorMessage(targetResult.error))
      else setTarget(targetResult.data)
    })
  }

  useExpenseSubscription(reloadExpenses, true)
  useBudgetAllocationSubscription(reloadAllocations, true)

  const handleCategoryClick = useCallback((budget: BudgetSummary) => {
    setSelectedCategoryId(budget.category_id)
    setCategoryExpenseDialogOpen(true)
  }, [])

  const handleAddFunds = useCallback((e: React.MouseEvent, budget: BudgetSummary) => {
    e.stopPropagation()
    setRebalanceDestId(budget.category_id)
    setRebalanceOpen(true)
  }, [])

  const isEmpty = budgets.length === 0 && !target

  // Unallocated pool: target − sum of regular (non-allowance) allocations.
  const regularAllocatedTotal = budgets.reduce(
    (sum, b) => sum + Number(b.allocated_amount),
    0
  )
  const targetAmount = target ? Number(target.target_amount) : 0
  const unallocated = target ? targetAmount - regularAllocatedTotal : 0
  const hasTarget = target !== null

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
            target={hasTarget ? { amount: targetAmount, unallocated } : undefined}
            dayOfMonth={isCurrentMonth ? new Date().getDate() : undefined}
            daysInMonth={isCurrentMonth ? getDaysInMonth(new Date()) : undefined}
          />

          {/* Burndown Chart */}
          <BudgetBurndownChartClient
            budgets={budgets}
            currentMonth={budgetMonth}
            initialExpenses={expenses}
            target={hasTarget ? { amount: targetAmount, unallocated } : undefined}
          />

          {/* Category Budgets */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">Categories</h3>
            <div className="space-y-2">
              {budgets.map((budget) => (
                <CategoryBudgetCard
                  key={budget.id}
                  budget={budget}
                  showHeader
                  isCurrentMonth={isCurrentMonth}
                  dayOfMonth={isCurrentMonth ? new Date().getDate() : undefined}
                  daysInMonth={isCurrentMonth ? getDaysInMonth(new Date()) : undefined}
                  onClick={handleCategoryClick}
                  onAddFunds={handleAddFunds}
                />
              ))}
            </div>
          </div>

          {/* Allowances */}
          {allowances.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">Allowances</h3>
              <div className="space-y-2">
                {allowances.map((allowance) => (
                  <CategoryBudgetCard
                    key={allowance.id}
                    budget={allowance}
                    showHeader
                    isCurrentMonth={isCurrentMonth}
                    dayOfMonth={isCurrentMonth ? new Date().getDate() : undefined}
                    daysInMonth={isCurrentMonth ? getDaysInMonth(new Date()) : undefined}
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
        onSuccess={reloadData}
        categories={categories}
        householdId={householdId}
        budgetMonth={budgetMonth}
        initialAllocations={[...budgets, ...allowances]}
        initialTarget={target}
      />

      {/* Rebalance Dialog */}
      <RebalanceDialog
        open={rebalanceOpen}
        onOpenChange={(v) => { setRebalanceOpen(v); if (!v) setRebalanceDestId(null) }}
        onSuccess={reloadData}
        budgets={[...budgets, ...allowances]}
        householdId={householdId}
        budgetMonth={budgetMonth}
        initialDestId={rebalanceDestId}
        hasTarget={hasTarget}
        unallocated={unallocated}
      />

      {/* Category Expense Detail Dialog */}
      <CategoryExpenseDialog
        open={categoryExpenseDialogOpen}
        onOpenChange={setCategoryExpenseDialogOpen}
        budget={selectedBudget}
        budgetMonth={budgetMonth}
        allExpenses={expenses}
        categories={categories}
        syncedExpenseTitles={syncedExpenseTitles}
      />
    </>
  )
}

