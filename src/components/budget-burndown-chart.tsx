"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase"
import { format, getDaysInMonth, parseISO } from "date-fns"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
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
  planned: number // Linear projection
  actual: number // Cumulative actual spending
}

interface BudgetBurndownChartProps {
  budgets: BudgetSummary[]
  householdId: string
  currentMonth: string // "2026-01-01" format
}

export function BudgetBurndownChart({
  budgets,
  householdId,
  currentMonth,
}: BudgetBurndownChartProps) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadExpenses = async () => {
      const supabase = createClient()

      // Calculate next month for range query
      const currentDate = parseISO(currentMonth)
      const nextMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        1
      )
      const nextMonthStr = format(nextMonth, "yyyy-MM-dd")

      const { data, error } = await supabase
        .from("expenses")
        .select("expense_date, converted_amount, category_id")
        .eq("household_id", householdId)
        .gte("expense_date", currentMonth)
        .lt("expense_date", nextMonthStr)
        .order("expense_date", { ascending: true })

      if (error) {
        console.error("Error loading expenses:", error)
      } else if (data) {
        setExpenses(data as Expense[])
      }

      setLoading(false)
    }

    loadExpenses()
  }, [householdId, currentMonth])

  const chartData = useMemo(() => {
    if (budgets.length === 0) return []

    // Calculate total allocated amount for selected category
    const totalAllocated =
      selectedCategoryId === "all"
        ? budgets.reduce((sum, b) => sum + b.allocated_amount, 0)
        : budgets.find((b) => b.category_id === selectedCategoryId)
            ?.allocated_amount || 0

    // Filter expenses by selected category
    const filteredExpenses =
      selectedCategoryId === "all"
        ? expenses
        : expenses.filter((e) => e.category_id === selectedCategoryId)

    // Get number of days in the month
    const currentDate = parseISO(currentMonth)
    const daysInMonth = getDaysInMonth(currentDate)

    // Group expenses by date and calculate cumulative totals
    const expensesByDate = new Map<string, number>()
    filteredExpenses.forEach((expense) => {
      const current = expensesByDate.get(expense.expense_date) || 0
      expensesByDate.set(expense.expense_date, current + expense.converted_amount)
    })

    // Build data points for each day of the month
    const data: BurndownDataPoint[] = []
    let cumulativeActual = 0

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        day
      )
      const dateKey = format(date, "yyyy-MM-dd")
      const dateLabel = format(date, "MMM d")

      // Add daily expenses to cumulative total
      const dailyExpenses = expensesByDate.get(dateKey) || 0
      cumulativeActual += dailyExpenses

      // Calculate planned amount (linear progression)
      const planned = (totalAllocated / daysInMonth) * day

      data.push({
        date: dateLabel,
        dateKey,
        planned: Math.round(planned * 100) / 100,
        actual: Math.round(cumulativeActual * 100) / 100,
      })
    }

    return data
  }, [budgets, expenses, selectedCategoryId, currentMonth])

  // Prepare category options for the filter
  const categoryOptions = useMemo(() => {
    return [
      { id: "all", name: "All Categories" },
      ...budgets.map((b) => ({ id: b.category_id, name: b.category_name })),
    ]
  }, [budgets])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Budget Burndown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Loading chart...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (budgets.length === 0) {
    return null
  }

  const selectedCategory = categoryOptions.find(
    (c) => c.id === selectedCategoryId
  )
  const totalAllocated =
    selectedCategoryId === "all"
      ? budgets.reduce((sum, b) => sum + b.allocated_amount, 0)
      : budgets.find((b) => b.category_id === selectedCategoryId)
          ?.allocated_amount || 0

  // Determine line color based on whether we're over budget
  const latestActual = chartData[chartData.length - 1]?.actual || 0
  const isOverBudget = latestActual > totalAllocated
  const actualLineColor = isOverBudget ? "#ef4444" : "#22c55e"

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Budget Burndown</CardTitle>
          <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
            <SelectTrigger className="w-[200px]">
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
      <CardContent>
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
                tickFormatter={(value) => `€${value}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                formatter={(value: number) => [`€${value.toFixed(2)}`, ""]}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="planned"
                stroke="#9ca3af"
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
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
