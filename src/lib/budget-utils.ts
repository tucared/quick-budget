type BudgetStatus = "over" | "fully_used" | "critical" | "ahead" | "warning" | "on_track"

function getBudgetStatus(percentSpent: number, dayOfMonth?: number, daysInMonth?: number, remainingAmount?: number): BudgetStatus {
  if (remainingAmount != null && Math.abs(remainingAmount) < 0.005) return "fully_used"
  if (percentSpent >= 100) return "over"
  if (percentSpent >= 95) return "critical"
  if (dayOfMonth != null && daysInMonth != null) {
    const idealPercent = (dayOfMonth / daysInMonth) * 100
    if (percentSpent > idealPercent * 1.1) return "ahead"
  }
  if (percentSpent >= 75) return "warning"
  return "on_track"
}

const statusTextColors: Record<BudgetStatus, string> = {
  over: "text-red-600",
  fully_used: "text-muted-foreground",
  critical: "text-red-600",
  ahead: "text-yellow-600",
  warning: "text-yellow-600",
  on_track: "text-green-600",
}

export function getBudgetStatusColor(percentSpent: number, dayOfMonth?: number, daysInMonth?: number, remainingAmount?: number): string {
  return statusTextColors[getBudgetStatus(percentSpent, dayOfMonth, daysInMonth, remainingAmount)]
}

const progressBarColors: Record<BudgetStatus, string> = {
  over: "bg-red-500",
  fully_used: "bg-gray-400",
  critical: "bg-red-500",
  ahead: "bg-yellow-500",
  warning: "bg-yellow-500",
  on_track: "bg-green-500",
}

export function getBudgetProgressBarColor(percentSpent: number, dayOfMonth?: number, daysInMonth?: number, remainingAmount?: number): string {
  return progressBarColors[getBudgetStatus(percentSpent, dayOfMonth, daysInMonth, remainingAmount)]
}

const statusLabels: Record<BudgetStatus, string> = {
  over: "Overspent",
  fully_used: "Fully used",
  critical: "Nearly exhausted",
  ahead: "Ahead of budget",
  warning: "Almost there",
  on_track: "On track",
}

export function getBudgetStatusLabel(percentSpent: number, dayOfMonth?: number, daysInMonth?: number, remainingAmount?: number): string {
  return statusLabels[getBudgetStatus(percentSpent, dayOfMonth, daysInMonth, remainingAmount)]
}

export interface BudgetStatusTheme {
  bg: string
  border: string
  text: string
  indicator: string
}

const statusThemes: Record<BudgetStatus, BudgetStatusTheme> = {
  over: { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", indicator: "bg-red-500" },
  fully_used: { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-600", indicator: "bg-gray-400" },
  critical: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-800", indicator: "bg-orange-500" },
  ahead: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-800", indicator: "bg-yellow-500" },
  warning: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-800", indicator: "bg-yellow-500" },
  on_track: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", indicator: "bg-green-500" },
}

export function getBudgetStatusTheme(percentSpent: number, dayOfMonth?: number, daysInMonth?: number, remainingAmount?: number): BudgetStatusTheme {
  return statusThemes[getBudgetStatus(percentSpent, dayOfMonth, daysInMonth, remainingAmount)]
}

