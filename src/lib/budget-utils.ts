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
  over: "text-[hsl(4,60%,44%)]",
  fully_used: "text-muted-foreground",
  critical: "text-[hsl(4,60%,44%)]",
  ahead: "text-[hsl(24,85%,42%)]",
  warning: "text-[hsl(24,85%,42%)]",
  on_track: "text-[hsl(160,40%,35%)]",
}

export function getBudgetStatusColor(percentSpent: number, dayOfMonth?: number, daysInMonth?: number, remainingAmount?: number): string {
  return statusTextColors[getBudgetStatus(percentSpent, dayOfMonth, daysInMonth, remainingAmount)]
}

const progressBarColors: Record<BudgetStatus, string> = {
  over: "bg-[hsl(4,60%,44%)]",
  fully_used: "bg-[hsl(30,5%,65%)]",
  critical: "bg-[hsl(4,60%,44%)]",
  ahead: "bg-[hsl(24,85%,42%)]",
  warning: "bg-[hsl(24,85%,42%)]",
  on_track: "bg-[hsl(160,40%,35%)]",
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
  over: { bg: "bg-[hsl(4,40%,96%)]", border: "border-[hsl(4,40%,80%)]", text: "text-[hsl(4,60%,44%)]", indicator: "bg-[hsl(4,60%,44%)]" },
  fully_used: { bg: "bg-secondary", border: "border-border", text: "text-muted-foreground", indicator: "bg-[hsl(30,5%,65%)]" },
  critical: { bg: "bg-[hsl(20,40%,95%)]", border: "border-[hsl(20,40%,80%)]", text: "text-[hsl(4,60%,44%)]", indicator: "bg-[hsl(4,60%,44%)]" },
  ahead: { bg: "bg-[hsl(36,40%,94%)]", border: "border-[hsl(36,30%,78%)]", text: "text-[hsl(24,85%,42%)]", indicator: "bg-[hsl(24,85%,42%)]" },
  warning: { bg: "bg-[hsl(36,40%,94%)]", border: "border-[hsl(36,30%,78%)]", text: "text-[hsl(24,85%,42%)]", indicator: "bg-[hsl(24,85%,42%)]" },
  on_track: { bg: "bg-[hsl(160,25%,95%)]", border: "border-[hsl(160,20%,80%)]", text: "text-[hsl(160,40%,35%)]", indicator: "bg-[hsl(160,40%,35%)]" },
}

export function getBudgetStatusTheme(percentSpent: number, dayOfMonth?: number, daysInMonth?: number, remainingAmount?: number): BudgetStatusTheme {
  return statusThemes[getBudgetStatus(percentSpent, dayOfMonth, daysInMonth, remainingAmount)]
}

