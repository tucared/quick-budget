"use client"

import { useState, useMemo } from "react"
import { format, getDaysInMonth, parseISO } from "date-fns"
import { formatCurrency } from "@/lib/currency"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
}

export function BudgetBurndownChartClient({
  budgets,
  currentMonth,
  initialExpenses,
}: BudgetBurndownChartClientProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all")
  const [error] = useState("")

  // expenses come from parent (kept live via parent's subscription)
  const expenses = initialExpenses

  const chartData = useMemo(() => {
    if (budgets.length === 0) return { data: [], weekends: [] }

    // Get set of category IDs from budgets prop (these are the categories we're tracking)
    const budgetCategoryIds = new Set(budgets.map((b) => b.category_id))

    // Calculate total allocated amount for selected category
    const totalAllocated =
      selectedCategoryId === "all"
        ? budgets.reduce((sum, b) => sum + (b.allocated_amount ?? 0), 0)
        : budgets.find((b) => b.category_id === selectedCategoryId)
            ?.allocated_amount ?? 0

    // Filter expenses by selected category AND only include expenses from budgeted categories
    const filteredExpenses =
      selectedCategoryId === "all"
        ? expenses.filter((e) => e.category_id && budgetCategoryIds.has(e.category_id))
        : expenses.filter((e) => e.category_id === selectedCategoryId)

    // Get number of days in the month and today's date
    const currentDate = parseISO(currentMonth)
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
      const plannedRemaining = totalAllocated - (totalAllocated / daysInMonth) * day

      // Calculate actual remaining (allocated - spent)
      // Only show actual data up to today, not future days
      const actualRemaining = totalAllocated - cumulativeActual

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

    return { data, weekends }
  }, [budgets, expenses, selectedCategoryId, currentMonth])

  // Prepare category options for the filter
  const categoryOptions = useMemo(() => {
    return [
      { id: "all", name: "All Categories" },
      ...budgets
        .filter((b) => b.category_id && b.category_name)
        .map((b) => ({ id: b.category_id!, name: b.category_name! })),
    ]
  }, [budgets])

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Budget Burndown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
            {error}
          </div>
        </CardContent>
      </Card>
    )
  }

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
    : "hsl(142.1 76.2% 36.3%)" // green-600

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <CardTitle>Budget Burndown</CardTitle>
          <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                }}
                formatter={(value: number | undefined) => [value !== undefined ? formatCurrency(value) : "", ""]}
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
