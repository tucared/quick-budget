"use client"

import { format, parseISO } from "date-fns"
import type { BudgetSummary } from "@/lib/types"
import { formatCurrency } from "@/lib/currency"

interface BudgetHistoryMiniProps {
  categoryId: string
  history: BudgetSummary[] // all history rows (caller filters to relevant months)
}

export function BudgetHistoryMini({ categoryId, history }: BudgetHistoryMiniProps) {
  const rows = history
    .filter((h) => h.category_id === categoryId)
    .sort((a, b) => (a.budget_month! > b.budget_month! ? -1 : 1))
    .slice(0, 3)

  if (rows.length === 0) {
    return <span className="text-xs text-muted-foreground">No history</span>
  }

  return (
    <div className="flex gap-3">
      {rows.map((row) => {
        const allocated = Number(row.allocated_amount)
        const spent = Number(row.spent_amount)
        const over = spent > allocated
        return (
          <div key={row.budget_month} className="text-xs">
            <div className="text-muted-foreground font-medium">
              {format(parseISO(row.budget_month!), "MMM")}
            </div>
            <div>
              {formatCurrency(allocated, 0)}
            </div>
            <div className={over ? "text-destructive" : "text-green-600"}>
              {formatCurrency(spent, 0)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
