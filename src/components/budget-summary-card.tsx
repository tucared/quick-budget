import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { BudgetSummary } from "@/lib/types"

interface BudgetSummaryCardProps {
  budgets: BudgetSummary[]
}

export function BudgetSummaryCard({ budgets }: BudgetSummaryCardProps) {
  const totalAllocated = budgets.reduce((sum, b) => sum + Number(b.allocated_amount), 0)
  const totalSpent = budgets.reduce((sum, b) => sum + Number(b.spent_amount), 0)
  const totalRemaining = totalAllocated - totalSpent
  const percentSpent = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0

  // Determine status color based on spending
  const getStatusColor = () => {
    if (percentSpent >= 95) return "text-red-600"
    if (percentSpent >= 75) return "text-yellow-600"
    return "text-green-600"
  }

  const getProgressBarColor = () => {
    if (percentSpent >= 95) return "bg-red-500"
    if (percentSpent >= 75) return "bg-yellow-500"
    return "bg-green-500"
  }

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle>Total Budget</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Amount grid */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Allocated</div>
              <div className="text-xl font-bold">${totalAllocated.toFixed(0)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Spent</div>
              <div className="text-xl font-bold">${totalSpent.toFixed(0)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Remaining</div>
              <div className={`text-xl font-bold ${getStatusColor()}`}>
                ${totalRemaining.toFixed(0)}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${getProgressBarColor()}`}
                style={{ width: `${Math.min(percentSpent, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {percentSpent.toFixed(0)}% spent
              </span>
              {percentSpent >= 95 && (
                <span className="text-red-600 font-medium">
                  Over budget!
                </span>
              )}
              {percentSpent >= 75 && percentSpent < 95 && (
                <span className="text-yellow-600 font-medium">
                  Almost there
                </span>
              )}
              {percentSpent < 75 && (
                <span className="text-green-600 font-medium">
                  On track
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
