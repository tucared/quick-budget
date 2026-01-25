import { format, parseISO } from "date-fns"
import type { GoalAllocation, Expense, CumulativeGoalData, GoalSummary } from "@/lib/types"

interface MonthlyNetSavings {
  month: string // "2021-03-01" format
  [categoryId: string]: number | string // category_id -> net savings (allocated - spent)
}

/**
 * Calculate monthly net savings for each goal category
 * Net savings = allocations - expenses for that month
 */
export function calculateMonthlyNetSavings(
  allocations: GoalAllocation[],
  expenses: Expense[]
): MonthlyNetSavings[] {
  // Group allocations by month and category
  const allocationsByMonth = new Map<string, Map<string, number>>()

  allocations.forEach((allocation) => {
    if (!allocationsByMonth.has(allocation.budget_month)) {
      allocationsByMonth.set(allocation.budget_month, new Map())
    }
    const monthMap = allocationsByMonth.get(allocation.budget_month)!
    monthMap.set(allocation.category_id, allocation.allocated_amount)
  })

  // Group expenses by month and category
  const expensesByMonth = new Map<string, Map<string, number>>()

  expenses.forEach((expense) => {
    if (!expense.category_id) return

    // Convert expense_date (YYYY-MM-DD) to first day of month (YYYY-MM-01)
    const date = parseISO(expense.expense_date)
    const monthKey = format(new Date(date.getFullYear(), date.getMonth(), 1), "yyyy-MM-dd")

    if (!expensesByMonth.has(monthKey)) {
      expensesByMonth.set(monthKey, new Map())
    }
    const monthMap = expensesByMonth.get(monthKey)!
    const current = monthMap.get(expense.category_id) || 0
    monthMap.set(expense.category_id, current + expense.converted_amount)
  })

  // Build monthly net savings
  const monthlyData: MonthlyNetSavings[] = []
  const allMonths = new Set([
    ...allocationsByMonth.keys(),
    ...expensesByMonth.keys(),
  ])

  // Sort months chronologically
  const sortedMonths = Array.from(allMonths).sort()

  sortedMonths.forEach((month) => {
    const allocationsMap = allocationsByMonth.get(month) || new Map()
    const expensesMap = expensesByMonth.get(month) || new Map()

    const monthData: MonthlyNetSavings = { month }

    // Get all categories that have allocations or expenses this month
    const allCategories = new Set([
      ...allocationsMap.keys(),
      ...expensesMap.keys(),
    ])

    allCategories.forEach((categoryId) => {
      const allocated = allocationsMap.get(categoryId) || 0
      const spent = expensesMap.get(categoryId) || 0
      monthData[categoryId] = allocated - spent
    })

    monthlyData.push(monthData)
  })

  return monthlyData
}

/**
 * Build cumulative data over time for stacked bar chart
 * Each month's cumulative value is the sum of all previous months' net savings
 */
export function buildCumulativeData(
  monthlyNetSavings: MonthlyNetSavings[],
  allocations: GoalAllocation[]
): CumulativeGoalData[] {
  if (monthlyNetSavings.length === 0) return []

  // Get unique category IDs and their names
  const categoryMap = new Map<string, string>()
  allocations.forEach((allocation) => {
    if (allocation.category?.name) {
      categoryMap.set(allocation.category_id, allocation.category.name)
    }
  })

  // Build cumulative totals
  const cumulativeData: CumulativeGoalData[] = []
  const runningTotals = new Map<string, number>()

  // Initialize running totals to 0 for all categories
  categoryMap.forEach((_, categoryId) => {
    runningTotals.set(categoryId, 0)
  })

  monthlyNetSavings.forEach((monthData) => {
    const monthDate = parseISO(monthData.month)
    const monthLabel = format(monthDate, "MMM yyyy") // "Mar 2021", "Apr 2021", etc.

    const dataPoint: CumulativeGoalData = {
      month: monthLabel,
      total: 0,
    }

    // Update running totals and build data point
    categoryMap.forEach((categoryName, categoryId) => {
      const netSavings = (monthData[categoryId] as number) || 0
      const currentTotal = runningTotals.get(categoryId)! + netSavings
      runningTotals.set(categoryId, currentTotal)

      dataPoint[categoryName] = Math.round(currentTotal * 100) / 100
    })

    // Calculate total
    dataPoint.total = Array.from(runningTotals.values()).reduce(
      (sum, value) => sum + value,
      0
    )
    dataPoint.total = Math.round(dataPoint.total * 100) / 100

    cumulativeData.push(dataPoint)
  })

  return cumulativeData
}

/**
 * Get the latest balance for each goal category
 */
export function getLatestBalances(
  cumulativeData: CumulativeGoalData[],
  allocations: GoalAllocation[]
): GoalSummary[] {
  if (cumulativeData.length === 0) return []

  const latestDataPoint = cumulativeData[cumulativeData.length - 1]
  const previousDataPoint = cumulativeData.length > 1
    ? cumulativeData[cumulativeData.length - 2]
    : null
  const summaries: GoalSummary[] = []

  // Get unique categories
  const categoryMap = new Map<string, GoalAllocation>()
  allocations.forEach((allocation) => {
    if (!categoryMap.has(allocation.category_id)) {
      categoryMap.set(allocation.category_id, allocation)
    }
  })

  categoryMap.forEach((allocation) => {
    const categoryName = allocation.category?.name || "Unknown"
    const currentBalance = (latestDataPoint[categoryName] as number) || 0
    const previousBalance = previousDataPoint
      ? ((previousDataPoint[categoryName] as number) || 0)
      : 0
    const lastContribution = currentBalance - previousBalance

    summaries.push({
      category_id: allocation.category_id,
      category_name: categoryName,
      category_icon: allocation.category?.icon || null,
      category_color: allocation.category?.color || null,
      current_balance: currentBalance,
      last_contribution: lastContribution,
    })
  })

  // Sort by balance descending
  summaries.sort((a, b) => b.current_balance - a.current_balance)

  return summaries
}

/**
 * Get the latest allocations (current month's contributions) for each goal
 */
export function getLatestAllocations(allocations: GoalAllocation[]): Map<string, number> {
  if (allocations.length === 0) return new Map()

  // Find the latest month
  const latestMonth = allocations.reduce((latest, alloc) => {
    return alloc.budget_month > latest ? alloc.budget_month : latest
  }, allocations[0].budget_month)

  // Build map of category_id -> allocated_amount for the latest month
  const latestAllocationsMap = new Map<string, number>()
  allocations
    .filter((alloc) => alloc.budget_month === latestMonth)
    .forEach((alloc) => {
      latestAllocationsMap.set(alloc.category_id, alloc.allocated_amount)
    })

  return latestAllocationsMap
}
