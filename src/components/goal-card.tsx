import { Card, CardContent } from "@/components/ui/card"
import type { GoalSummary } from "@/lib/types"

interface GoalCardProps {
  goal: GoalSummary
}

export function GoalCard({ goal }: GoalCardProps) {
  const currentBalance = Number(goal.current_balance)
  const lastContribution = Number(goal.last_contribution)

  // Determine color based on balance
  const getTextColor = () => {
    if (currentBalance < 0) return "text-red-600"
    if (currentBalance === 0) return "text-gray-500"
    return "text-green-600"
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        {/* Goal header with icon and name */}
        <div className="flex items-center gap-2 mb-3">
          {goal.category_icon && (
            <span className="text-2xl">{goal.category_icon}</span>
          )}
          <h3 className="font-semibold text-base flex-1">{goal.category_name}</h3>
        </div>

        {/* Current balance - prominent display */}
        <div className="mb-3 text-center">
          <div className="text-xs text-muted-foreground mb-1">Current Balance</div>
          <div className={`text-2xl font-bold ${getTextColor()}`}>
            €{currentBalance.toFixed(2)}
          </div>
        </div>

        {/* Last contribution */}
        <div className="text-center border-t pt-2">
          <div className="text-xs text-muted-foreground mb-0.5">
            Last Contribution
          </div>
          <div className="text-sm font-semibold">
            €{lastContribution.toFixed(2)}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
