"use client"

import { useMemo } from "react"
import { format, getDaysInMonth } from "date-fns"
import { formatCurrency } from "@/lib/currency"
import { parseLocalDate } from "@/lib/date-utils"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { BudgetSummary, Expense } from "@/lib/types"

interface BurndownDataPoint {
  date: string // "Jan 1", "Jan 2", etc.
  dateKey: string // "2026-01-01" for sorting
  planned: number // Remaining budget - linear burndown to zero
  actual: number | null // Actual remaining budget (allocated - spent), null for future dates
}

interface WeekendRange {
  start: string // Date label for start of weekend
  end: string // Date label for end of weekend
}

interface BudgetBurndownChartClientProps {
  budgets: BudgetSummary[]
  currentMonth: string // "2026-01-01" format
  initialExpenses: Expense[]
  target?: { amount: number; unallocated: number }
}

export function BudgetBurndownChartClient({
  budgets,
  currentMonth,
  initialExpenses,
  target,
}: BudgetBurndownChartClientProps) {
  // expenses come from parent (kept live via parent's subscription)
  const expenses = initialExpenses

  const chartData = useMemo(() => {
    if (budgets.length === 0) return { data: [], weekends: [], paceBaseline: 0, unallocated: 0 }

    // Get set of category IDs from budgets prop (these are the categories we're tracking)
    const budgetCategoryIds = new Set(budgets.map((b) => b.category_id))

    // Calculate total allocated amount
    const totalAllocated = budgets.reduce((sum, b) => sum + (b.allocated_amount ?? 0), 0)

    // When a monthly target exists, anchor the burndown to it so the chart
    // reflects the planned spend for the month — not just what's already
    // assigned to categories. Falls back to allocated total when no target.
    const paceBaseline = target?.amount ?? totalAllocated

    // Filter expenses to only include expenses from budgeted categories
    const filteredExpenses = expenses.filter((e) => e.category_id && budgetCategoryIds.has(e.category_id))

    const currentDate = parseLocalDate(currentMonth)
    const daysInMonth = getDaysInMonth(currentDate)
    const today = new Date()
    const todayDateKey = format(today, "yyyy-MM-dd")

    // Group expenses by date and calculate cumulative totals
    const expensesByDate = new Map<string, number>()
    filteredExpenses.forEach((expense) => {
      const current = expensesByDate.get(expense.expense_date) || 0
      expensesByDate.set(expense.expense_date, current + expense.converted_amount)
    })

    // Build data points for each day of the month
    const data: BurndownDataPoint[] = []
    const weekends: WeekendRange[] = []
    let cumulativeActual = 0
    let weekendStart: string | null = null

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        day
      )
      const dateKey = format(date, "yyyy-MM-dd")
      const dateLabel = format(date, "MMM d")
      const dayOfWeek = date.getDay() // 0 = Sunday, 6 = Saturday

      // Track weekend ranges
      if (dayOfWeek === 6 || dayOfWeek === 0) {
        // Saturday or Sunday
        if (!weekendStart) {
          weekendStart = dateLabel
        }
      } else {
        if (weekendStart) {
          // End of weekend, save the range
          weekends.push({
            start: weekendStart,
            end: data[data.length - 1]?.date || weekendStart,
          })
          weekendStart = null
        }
      }

      // Add daily expenses to cumulative total
      const dailyExpenses = expensesByDate.get(dateKey) || 0
      cumulativeActual += dailyExpenses

      // Calculate planned remaining (linear burndown to zero)
      const plannedRemaining = paceBaseline - (paceBaseline / daysInMonth) * day

      // Calculate actual remaining (baseline - spent)
      // Only show actual data up to today, not future days
      const actualRemaining = paceBaseline - cumulativeActual

      data.push({
        date: dateLabel,
        dateKey,
        planned: Math.round(plannedRemaining * 100) / 100,
        actual: dateKey <= todayDateKey ? Math.round(actualRemaining * 100) / 100 : null,
      })
    }

    // Close any open weekend at end of month
    if (weekendStart) {
      weekends.push({
        start: weekendStart,
        end: data[data.length - 1]?.date || weekendStart,
      })
    }

    return { data, weekends, paceBaseline, unallocated: target?.unallocated ?? 0 }
  }, [budgets, expenses, currentMonth, target])

  if (budgets.length === 0) {
    return null
  }

  // Determine line color based on whether we're over budget
  // In a burndown chart, over budget means remaining budget went negative
  const latestActual = chartData.data
    .filter((d) => d.actual !== null)
    .slice(-1)[0]?.actual ?? 0
  const isOverBudget = latestActual < 0
  const actualLineColor = isOverBudget
    ? "var(--destructive)"
    : "hsl(160 40% 35%)" // muted teal

  const { paceBaseline, unallocated } = chartData
  const showUnallocatedBand = unallocated > 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Budget Burndown</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        <div className="w-full h-[300px]">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={chartData.data}
              margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              {/* Weekend overlays */}
              {chartData.weekends.map((weekend, idx) => (
                <ReferenceArea
                  key={idx}
                  x1={weekend.start}
                  x2={weekend.end}
                  fill="var(--muted)"
                  fillOpacity={0.5}
                />
              ))}
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                tickFormatter={(value) => formatCurrency(value, 0)}
                width={60}
                domain={[(min: number) => Math.min(0, min), paceBaseline]}
              />
              {showUnallocatedBand && (
                <ReferenceArea
                  y1={paceBaseline - unallocated}
                  y2={paceBaseline}
                  fill="var(--muted-foreground)"
                  fillOpacity={0.08}
                  label={{
                    value: "Unallocated",
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "var(--muted-foreground)",
                  }}
                  ifOverflow="extendDomain"
                />
              )}
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                }}
                formatter={(value) => [typeof value === "number" ? formatCurrency(value) : "", ""]}
                labelStyle={{ color: "var(--foreground)" }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="planned"
                stroke="var(--muted-foreground)"
                strokeDasharray="5 5"
                strokeWidth={2}
                dot={false}
                name="Planned"
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke={actualLineColor}
                strokeWidth={2}
                dot={false}
                name="Actual"
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
