"use client"

import { useMemo } from "react"
import { format } from "date-fns"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { formatCurrency } from "@/lib/currency"
import { parseLocalDate } from "@/lib/date-utils"
import { computeDailySpending } from "@/lib/budget-utils"
import type { Expense } from "@/lib/types"

interface CategoryDailySpendingChartProps {
  expenses: Expense[]
  budgetMonth: string
}

export function CategoryDailySpendingChart({
  expenses,
  budgetMonth,
}: CategoryDailySpendingChartProps) {
  const data = useMemo(
    () => computeDailySpending(expenses, budgetMonth),
    [expenses, budgetMonth]
  )

  if (expenses.length === 0) return null

  return (
    <div className="mt-3">
      <div className="text-xs font-medium text-muted-foreground mb-1">
        Daily spending
      </div>
      <div className="w-full h-[140px]">
        <ResponsiveContainer width="100%" height={140}>
          <BarChart
            data={data}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            <XAxis
              dataKey="dateKey"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              interval={4}
              tickFormatter={(value: string) => String(parseLocalDate(value).getDate())}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tickFormatter={(value) => formatCurrency(value, 0)}
              width={48}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value) => [
                typeof value === "number" ? formatCurrency(value) : "",
                "Spent",
              ]}
              labelFormatter={(value) =>
                typeof value === "string"
                  ? format(parseLocalDate(value), "EEE, MMM d")
                  : ""
              }
            />
            <Bar dataKey="total" fill="hsl(24,85%,42%)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
