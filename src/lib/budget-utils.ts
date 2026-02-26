type BudgetStatus = "over" | "critical" | "warning" | "on_track"

function getBudgetStatus(percentSpent: number): BudgetStatus {
  if (percentSpent >= 100) return "over"
  if (percentSpent >= 95) return "critical"
  if (percentSpent >= 75) return "warning"
  return "on_track"
}

const statusTextColors: Record<BudgetStatus, string> = {
  over: "text-red-600",
  critical: "text-red-600",
  warning: "text-yellow-600",
  on_track: "text-green-600",
}

export function getBudgetStatusColor(percentSpent: number): string {
  return statusTextColors[getBudgetStatus(percentSpent)]
}

const progressBarColors: Record<BudgetStatus, string> = {
  over: "bg-red-500",
  critical: "bg-red-500",
  warning: "bg-yellow-500",
  on_track: "bg-green-500",
}

export function getBudgetProgressBarColor(percentSpent: number): string {
  return progressBarColors[getBudgetStatus(percentSpent)]
}

const statusLabels: Record<BudgetStatus, string> = {
  over: "Exhausted",
  critical: "Nearly exhausted",
  warning: "Almost there",
  on_track: "On track",
}

export function getBudgetStatusLabel(percentSpent: number): string {
  return statusLabels[getBudgetStatus(percentSpent)]
}

export interface BudgetStatusTheme {
  bg: string
  border: string
  text: string
  indicator: string
}

const statusThemes: Record<BudgetStatus, BudgetStatusTheme> = {
  over: { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", indicator: "bg-red-500" },
  critical: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-800", indicator: "bg-orange-500" },
  warning: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-800", indicator: "bg-yellow-500" },
  on_track: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", indicator: "bg-green-500" },
}

export function getBudgetStatusTheme(percentSpent: number): BudgetStatusTheme {
  return statusThemes[getBudgetStatus(percentSpent)]
}
