"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import type { BudgetSummary } from "@/lib/types"
import { formatCurrency, formatNumber } from "@/lib/currency"
import { getBudgetProgressBarColor, getBudgetStatusLabel, getBudgetStatusColor, getBudgetStatusTheme } from "@/lib/budget-utils"

interface BudgetSummaryCardProps {
  budgets: BudgetSummary[]
  target?: { amount: number; unallocated: number }
  dayOfMonth?: number
  daysInMonth?: number
  /** EUR delta from budget "spent" to actual cash flow (Tricount), or null when none. */
  cashflowAdjustment?: number | null
}

export function BudgetSummaryCard({ budgets, target, dayOfMonth, daysInMonth, cashflowAdjustment }: BudgetSummaryCardProps) {
  const totalAllocated = budgets.reduce((sum, b) => sum + Number(b.allocated_amount), 0)
  const totalSpent = budgets.reduce((sum, b) => sum + Number(b.spent_amount), 0)
  const paceBaseline = target ? target.amount : totalAllocated
  const totalRemaining = paceBaseline - totalSpent
  const percentSpent = paceBaseline > 0 ? (totalSpent / paceBaseline) * 100 : 0
  const theme = getBudgetStatusTheme(percentSpent, dayOfMonth, daysInMonth, totalRemaining)
  // Actual cash that left the wallet: budget "spent" (share-based) plus the
  // Tricount cash-flow adjustment (what was actually paid, income netted in).
  // Only meaningful when Tricount activity makes it differ from "spent".
  const showCashflow = cashflowAdjustment != null && Math.abs(cashflowAdjustment) >= 0.005
  const cashOut = totalSpent + (cashflowAdjustment ?? 0)
  const percentCash = paceBaseline > 0 ? (cashOut / paceBaseline) * 100 : 0

  // The summary line can show budget "spent" (share-based) or actual "cash out".
  // The hero remaining, bar, and status stay share-based — budget tracking is
  // deliberately about consumption, not wallet movement.
  const [view, setView] = useState<"spent" | "cash">("spent")
  const showCash = view === "cash" && showCashflow

  return (
    <Card className={`border-l-4 ${theme.border} ${theme.bg}`}>
      <CardContent className="pt-4 pb-4">
        {/* Hero: remaining amount, with the Spent/Cash basis toggle top-right */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground mb-0.5 font-medium">Remaining this month</div>
            <div className={`text-3xl font-bold ${getBudgetStatusColor(percentSpent, dayOfMonth, daysInMonth, totalRemaining)}`}>
              {formatCurrency(totalRemaining)}
            </div>
          </div>
          {showCashflow && (
            <div
              className="flex shrink-0 rounded-md border border-border overflow-hidden text-[11px] leading-none"
              role="group"
              aria-label="Summary basis"
            >
              <button
                type="button"
                onClick={() => setView("spent")}
                aria-pressed={view === "spent"}
                className={`px-2 py-1 transition-colors ${view === "spent" ? "bg-foreground/10 text-foreground font-medium" : "text-muted-foreground"}`}
              >
                Spent
              </button>
              <button
                type="button"
                onClick={() => setView("cash")}
                aria-pressed={view === "cash"}
                className={`px-2 py-1 transition-colors ${view === "cash" ? "bg-foreground/10 text-foreground font-medium" : "text-muted-foreground"}`}
                title="Actual cash that left the wallet this month (Tricount share replaced by what you paid, income netted in)"
              >
                Cash
              </button>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden mb-2">
          <div
            className={`h-full transition-all duration-300 ${getBudgetProgressBarColor(percentSpent, dayOfMonth, daysInMonth, totalRemaining)}`}
            style={{ width: `${Math.min(percentSpent, 100)}%` }}
          />
        </div>

        {/* Footer row */}
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">
            {showCash ? (
              <>
                <span className="text-foreground font-medium">{formatCurrency(cashOut)}</span> cash out · {formatNumber(percentCash, 0)}%{target ? " of target" : ""}
              </>
            ) : (
              <>
                {formatCurrency(totalSpent)} of {formatCurrency(paceBaseline)} spent · {formatNumber(percentSpent, 0)}%{target ? " of target" : ""}
              </>
            )}
          </span>
          <span className={`${getBudgetStatusColor(percentSpent, dayOfMonth, daysInMonth, totalRemaining)} font-medium`}>
            {getBudgetStatusLabel(percentSpent, dayOfMonth, daysInMonth, totalRemaining)}
          </span>
        </div>

      </CardContent>
    </Card>
  )
}
