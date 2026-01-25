"use client"

import { useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { CumulativeGoalData, GoalAllocation } from "@/lib/types"

interface GoalsCumulativeChartProps {
  data: CumulativeGoalData[]
  allocations: GoalAllocation[]
}

// Default colors for goals if not specified in database
const DEFAULT_COLORS = [
  "#3b82f6", // blue-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#f59e0b", // amber-500
  "#10b981", // emerald-500
  "#6366f1", // indigo-500
  "#f97316", // orange-500
]

export function GoalsCumulativeChart({
  data,
  allocations,
}: GoalsCumulativeChartProps) {
  // Get unique goal names and their colors
  const goalConfig = useMemo(() => {
    const categoryMap = new Map<string, { color: string; icon: string | null }>()

    allocations.forEach((allocation, index) => {
      if (allocation.category?.name) {
        categoryMap.set(allocation.category.name, {
          color: allocation.category.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
          icon: allocation.category.icon,
        })
      }
    })

    return categoryMap
  }, [allocations])

  // Sort goal names alphabetically for consistent display
  const goalNames = useMemo(() => {
    return Array.from(goalConfig.keys()).sort()
  }, [goalConfig])

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Net Worth Growth</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No data available yet
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Net Worth Growth</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        <div className="w-full h-[300px]">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={data}
              margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
                angle={-45}
                textAnchor="end"
                height={80}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
                tickFormatter={(value) => `€${value}`}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                formatter={(value: number) => `€${value.toFixed(2)}`}
                labelStyle={{ color: "hsl(var(--foreground))", marginBottom: "8px" }}
              />
              <Legend
                wrapperStyle={{ fontSize: "12px" }}
                iconType="square"
              />
              {goalNames.map((goalName) => {
                const config = goalConfig.get(goalName)!
                return (
                  <Bar
                    key={goalName}
                    dataKey={goalName}
                    stackId="goals"
                    fill={config.color}
                    name={goalName}
                  />
                )
              })}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
