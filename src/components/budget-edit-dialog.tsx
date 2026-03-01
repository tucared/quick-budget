"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { format, subMonths, parseISO } from "date-fns"
import { createClient } from "@/lib/supabase"
import { formatCurrency } from "@/lib/currency"
import { getErrorMessage } from "@/lib/error-handler"
import type { Category, BudgetSummary, BudgetAllocation } from "@/lib/types"
import { BudgetHistoryMini } from "@/components/budget-history-mini"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CentsInput } from "@/components/ui/cents-input"

interface BudgetEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  categories: Category[]
  householdId: string
  budgetMonth: string // yyyy-MM-dd
}

interface CategoryAmountEntry {
  categoryId: string
  cents: number // 0 = no allocation
  existingAllocationId?: string
}

export function BudgetEditDialog({
  open,
  onOpenChange,
  onSuccess,
  categories,
  householdId,
  budgetMonth,
}: BudgetEditDialogProps) {
  const [entries, setEntries] = useState<CategoryAmountEntry[]>([])
  const [history, setHistory] = useState<BudgetSummary[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const activeCategories = useMemo(() => categories.filter((c) => c.is_active), [categories])
  const regularCategories = useMemo(() => activeCategories.filter((c) => !c.exclude_from_budget_total), [activeCategories])
  const allowanceCategories = useMemo(() => activeCategories.filter((c) => c.exclude_from_budget_total), [activeCategories])

  const loadData = useCallback(async () => {
    if (!open) return
    setLoading(true)
    setError("")

    const supabase = createClient()

    const prevMonths = [1, 2, 3].map((n) =>
      format(subMonths(parseISO(budgetMonth), n), "yyyy-MM-dd")
    )

    const [allocationsRes, historyRes] = await Promise.all([
      supabase
        .from("budget_allocations")
        .select("*")
        .eq("household_id", householdId)
        .eq("budget_month", budgetMonth),
      supabase
        .from("budget_summary")
        .select("*")
        .eq("household_id", householdId)
        .in("budget_month", prevMonths),
    ])

    if (allocationsRes.error) {
      setError(getErrorMessage(allocationsRes.error))
      setLoading(false)
      return
    }

    if (historyRes.error) {
      console.error("Failed to fetch history:", historyRes.error)
    }

    const allocations = (allocationsRes.data || []) as BudgetAllocation[]
    setHistory((historyRes.data || []) as BudgetSummary[])

    const newEntries = activeCategories.map((cat) => {
      const existing = allocations.find((a) => a.category_id === cat.id)
      return {
        categoryId: cat.id,
        cents: existing ? Math.round(Number(existing.allocated_amount) * 100) : 0,
        existingAllocationId: existing?.id,
      }
    })
    setEntries(newEntries)
    setLoading(false)
  }, [open, householdId, budgetMonth, activeCategories])

  useEffect(() => {
    loadData()
  }, [open, householdId, budgetMonth]) // eslint-disable-line react-hooks/exhaustive-deps

  function updateCents(categoryId: string, cents: number) {
    setEntries((prev) =>
      prev.map((e) => (e.categoryId === categoryId ? { ...e, cents } : e))
    )
  }

  async function copyFromPreviousMonth() {
    setError("")
    const supabase = createClient()
    const prevMonth = format(subMonths(parseISO(budgetMonth), 1), "yyyy-MM-dd")

    const { data, error: fetchError } = await supabase
      .from("budget_allocations")
      .select("*")
      .eq("household_id", householdId)
      .eq("budget_month", prevMonth)

    if (fetchError) {
      setError(getErrorMessage(fetchError))
      return
    }

    const prevAllocations = (data || []) as BudgetAllocation[]
    if (prevAllocations.length === 0) {
      setError("No allocations found for previous month")
      return
    }

    setEntries((prev) =>
      prev.map((entry) => {
        const prevAlloc = prevAllocations.find((a) => a.category_id === entry.categoryId)
        return prevAlloc
          ? { ...entry, cents: Math.round(Number(prevAlloc.allocated_amount) * 100) }
          : entry
      })
    )
  }

  async function handleSave() {
    setSaving(true)
    setError("")

    const supabase = createClient()

    const allocations = entries.map((e) => ({
      category_id: e.categoryId,
      amount: e.cents / 100,
    }))

    try {
      const { error: rpcError } = await supabase.rpc("save_budget", {
        p_household_id: householdId,
        p_budget_month: budgetMonth,
        p_allocations: allocations,
      })

      if (rpcError) {
        setError(getErrorMessage(rpcError))
        setSaving(false)
        return
      }

      onOpenChange(false)
      onSuccess?.()
    } catch {
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const regularTotal =
    entries
      .filter((e) => regularCategories.some((c) => c.id === e.categoryId))
      .reduce((sum, e) => sum + e.cents, 0) / 100

  function renderCategoryRow(cat: Category) {
    const entry = entries.find((e) => e.categoryId === cat.id)
    if (!entry) return null
    return (
      <div key={cat.id} className="flex items-center gap-2 sm:gap-3 py-2">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          {cat.icon && <span className="text-base sm:text-lg shrink-0">{cat.icon}</span>}
          <span className="text-sm font-medium truncate">{cat.name}</span>
        </div>
        <BudgetHistoryMini categoryId={cat.id} history={history} />
        <CentsInput
          value={entry.cents}
          onChange={(cents) => updateCents(cat.id, cents)}
          className="w-20 sm:w-28 shrink-0 h-8"
        />
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-h-[90vh] sm:overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Edit Budget - {format(parseISO(budgetMonth), "MMMM yyyy")}
          </DialogTitle>
          <DialogDescription>
            Set monthly allocations for each category.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={copyFromPreviousMonth}>
                Copy from previous month
              </Button>
            </div>

            {regularCategories.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2">
                  Categories
                </h4>
                <div className="divide-y">{regularCategories.map(renderCategoryRow)}</div>
                <div className="flex justify-between items-center pt-2 text-sm font-semibold">
                  <span>Subtotal</span>
                  <span>{formatCurrency(regularTotal, 0)}</span>
                </div>
              </div>
            )}

            {allowanceCategories.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2">
                  Allowances
                </h4>
                <div className="divide-y">{allowanceCategories.map(renderCategoryRow)}</div>
              </div>
            )}
          </>
        )}

        <DialogFooter className="flex-row justify-end sm:justify-end">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
