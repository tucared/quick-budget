import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { CumulativeGoalData, GoalAllocation } from "@/lib/types"

interface GoalsSummaryCardProps {
  cumulativeData: CumulativeGoalData[]
  latestAllocations: Map<string, number>
}

export function GoalsSummaryCard({
  cumulativeData,
  latestAllocations,
}: GoalsSummaryCardProps) {
  // Calculate total accumulated (latest cumulative value)
  const totalAccumulated =
    cumulativeData.length > 0
      ? cumulativeData[cumulativeData.length - 1].total
      : 0

  // Calculate total monthly contribution
  const totalMonthlyContribution = Array.from(latestAllocations.values()).reduce(
    (sum, amount) => sum + amount,
    0
  )

  return (
    <Card className="border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Overview</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">
              Net Worth
            </div>
            <div className="text-2xl font-semibold text-green-600">
              €{totalAccumulated.toFixed(0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">
              Monthly Contribution
            </div>
            <div className="text-2xl font-semibold">
              €{totalMonthlyContribution.toFixed(0)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
