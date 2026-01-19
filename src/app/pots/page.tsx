"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { useUser } from "@/lib/hooks/use-user"
import type { GoalAllocation, Expense, Category } from "@/lib/types"
import { GoalsSummaryCard } from "@/components/goals-summary-card"
import { GoalCard } from "@/components/goal-card"
import { GoalsCumulativeChart } from "@/components/goals-cumulative-chart"
import { Button } from "@/components/ui/button"
import {
  calculateMonthlyNetSavings,
  buildCumulativeData,
  getLatestBalances,
  getLatestAllocations,
} from "@/lib/goals-utils"

export default function GoalsPage() {
  const router = useRouter()
  const { user } = useUser()
  const [allocations, setAllocations] = useState<GoalAllocation[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    const loadGoalData = async (householdId: string) => {
      // Load all long-term budget allocations with category details
      const { data: allocationData, error: allocError } = await supabase
        .from("budget_allocations")
        .select(`
          *,
          categories!inner(
            id,
            name,
            icon,
            color,
            category_type
          )
        `)
        .eq("household_id", householdId)
        .eq("categories.category_type", "long_term")
        .order("budget_month", { ascending: true })

      if (allocError) {
        console.error("Error loading allocations:", allocError)
      } else if (allocationData) {
        // Transform data to match GoalAllocation type
        const transformedAllocations: GoalAllocation[] = allocationData.map(
          (item: any) => ({
            ...item,
            category: item.categories as Category,
          })
        )
        setAllocations(transformedAllocations)

        // Get category IDs for expense filtering
        const categoryIds = transformedAllocations.map((a) => a.category_id)

        // Load expenses for long-term categories
        if (categoryIds.length > 0) {
          const { data: expenseData, error: expError } = await supabase
            .from("expenses")
            .select("expense_date, converted_amount, category_id")
            .eq("household_id", householdId)
            .in("category_id", categoryIds)
            .order("expense_date", { ascending: true })

          if (expError) {
            console.error("Error loading expenses:", expError)
          } else if (expenseData) {
            setExpenses(expenseData as Expense[])
          }
        }
      }

      setLoading(false)
    }

    // Only load data if user is loaded
    if (!user?.householdId) {
      setLoading(false)
      return
    }

    // Set up real-time subscriptions
    const expensesChannel = supabase
      .channel("goals_expenses_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expenses",
        },
        () => {
          // Reload data when any expense is added/updated/deleted
          if (user?.householdId) {
            loadGoalData(user.householdId)
          }
        }
      )
      .subscribe()

    const allocationsChannel = supabase
      .channel("goals_allocations_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "budget_allocations",
        },
        () => {
          // Reload data when allocations change
          if (user?.householdId) {
            loadGoalData(user.householdId)
          }
        }
      )
      .subscribe()

    loadGoalData(user.householdId)

    return () => {
      supabase.removeChannel(expensesChannel)
      supabase.removeChannel(allocationsChannel)
    }
  }, [user])

  // Process data using utilities
  const { cumulativeData, goalSummaries, latestAllocationsMap } = useMemo(() => {
    if (allocations.length === 0) {
      return {
        cumulativeData: [],
        goalSummaries: [],
        latestAllocationsMap: new Map(),
      }
    }

    const monthlyNet = calculateMonthlyNetSavings(allocations, expenses)
    const cumulative = buildCumulativeData(monthlyNet, allocations)
    const summaries = getLatestBalances(cumulative, allocations)
    const latestAllocs = getLatestAllocations(allocations)

    return {
      cumulativeData: cumulative,
      goalSummaries: summaries,
      latestAllocationsMap: latestAllocs,
    }
  }, [allocations, expenses])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="container mx-auto px-4 py-3">
          {/* Top row: Title left, Welcome right - mobile friendly */}
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold whitespace-nowrap">Quick Budget</h1>
            {user && (
              <p className="text-sm text-muted-foreground whitespace-nowrap">
                Welcome, {user.fullName}
              </p>
            )}
          </div>
          {/* Bottom row: Navigation buttons */}
          <div className="flex items-center gap-2 justify-center">
            <Button variant="outline" onClick={() => router.push("/expenses")}>
              Expenses
            </Button>
            <Button variant="outline" onClick={() => router.push("/budget")}>
              Budget
            </Button>
            <Button variant="default" disabled>
              Pots
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              Log Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 max-w-6xl">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading pots...
          </div>
        ) : allocations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-lg font-medium mb-2">No pots set yet</p>
            <p className="text-sm">
              Pot allocations will appear here once configured
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Total Pots Summary */}
            <GoalsSummaryCard
              cumulativeData={cumulativeData}
              latestAllocations={latestAllocationsMap}
            />

            {/* Cumulative Chart */}
            <GoalsCumulativeChart
              data={cumulativeData}
              allocations={allocations}
            />

            {/* Individual Pot Cards Grid */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Individual Pots</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {goalSummaries.map((goal) => (
                  <GoalCard key={goal.category_id} goal={goal} />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
