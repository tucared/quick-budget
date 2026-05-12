"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { format } from "date-fns"
import { createClient } from "@/lib/supabase"
import { parseLocalDate } from "@/lib/date-utils"
import { formatCurrency } from "@/lib/currency"
import { getErrorMessage } from "@/lib/error-handler"
import type { Category, BudgetSummary, MonthlyBudgetTarget } from "@/lib/types"
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
  initialAllocations?: BudgetSummary[]
  initialTarget?: MonthlyBudgetTarget | null
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
  initialAllocations,
  initialTarget,
}: BudgetEditDialogProps) {
  const [entries, setEntries] = useState<CategoryAmountEntry[]>([])
  const [targetCents, setTargetCents] = useState(0)
  const [initialTargetExists, setInitialTargetExists] = useState(false)
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

    // Use parent-provided data if available, otherwise fetch from Supabase
    if (initialAllocations && initialTarget !== undefined) {
      setTargetCents(initialTarget ? Math.round(Number(initialTarget.target_amount) * 100) : 0)
      setInitialTargetExists(initialTarget !== null)

      const newEntries = activeCategories.map((cat) => {
        const existing = initialAllocations.find((a) => a.category_id === cat.id)
        return {
          categoryId: cat.id,
          cents: existing ? Math.round(Number(existing.allocated_amount) * 100) : 0,
          existingAllocationId: existing?.id ?? undefined,
        }
      })
      setEntries(newEntries)
      setLoading(false)
      return
    }

    const supabase = createClient()

    const [allocationsRes, targetRes] = await Promise.all([
      supabase
        .from("budget_allocations")
        .select("*")
        .eq("household_id", householdId)
        .eq("budget_month", budgetMonth),
      supabase
        .from("monthly_budget_targets")
        .select("*")
        .eq("household_id", householdId)
        .eq("budget_month", budgetMonth)
        .maybeSingle(),
    ])

    if (allocationsRes.error) {
      setError(getErrorMessage(allocationsRes.error))
      setLoading(false)
      return
    }

    if (targetRes.error) {
      setError(getErrorMessage(targetRes.error))
      setLoading(false)
      return
    }

    const allocations = allocationsRes.data || []
    const target = targetRes.data as MonthlyBudgetTarget | null

    setTargetCents(target ? Math.round(Number(target.target_amount) * 100) : 0)
    setInitialTargetExists(target !== null)

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
  }, [open, householdId, budgetMonth, activeCategories, initialAllocations, initialTarget])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadData is async; setState only runs after awaits, not synchronously
    loadData()
  }, [open, householdId, budgetMonth]) // eslint-disable-line react-hooks/exhaustive-deps

  function updateCents(categoryId: string, cents: number) {
    setEntries((prev) =>
      prev.map((e) => (e.categoryId === categoryId ? { ...e, cents } : e))
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

    const hasTarget = targetCents > 0
    const clearTarget = initialTargetExists && !hasTarget

    try {
      const { error: rpcError } = await supabase.rpc("save_budget", {
        p_household_id: householdId,
        p_budget_month: budgetMonth,
        p_allocations: allocations,
        p_target_amount: hasTarget ? targetCents / 100 : undefined,
        p_clear_target: clearTarget,
      })

      if (rpcError) {
        setError(getErrorMessage(rpcError))
        setSaving(false)
        return
      }

      onOpenChange(false)
      onSuccess?.()
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const regularAllocatedCents = entries
    .filter((e) => regularCategories.some((c) => c.id === e.categoryId))
    .reduce((sum, e) => sum + e.cents, 0)
  const regularAllocated = regularAllocatedCents / 100
  const target = targetCents / 100
  const unallocated = target - regularAllocated
  const overBy = regularAllocated - target
  const hasTarget = targetCents > 0

  function renderCategoryRow(cat: Category) {
    const entry = entries.find((e) => e.categoryId === cat.id)
    if (!entry) return null
    return (
      <div key={cat.id} className="flex items-center gap-2 sm:gap-3 py-2">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          {cat.icon && <span className="text-base sm:text-lg shrink-0">{cat.icon}</span>}
          <span className="text-sm font-medium truncate">{cat.name}</span>
        </div>
        <CentsInput
          value={entry.cents}
          onChange={(cents) => updateCents(cat.id, cents)}
          className="w-24 sm:w-32 shrink-0 h-8"
        />
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Edit Budget - {format(parseLocalDate(budgetMonth), "MMMM yyyy")}
          </DialogTitle>
          <DialogDescription>
            Set a monthly target, then split it across categories.
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
            {regularCategories.length > 0 && (
              <div>
                <div className="flex items-center justify-between pb-2 border-b">
                  <span className="text-sm font-semibold">Target</span>
                  <CentsInput
                    value={targetCents}
                    onChange={setTargetCents}
                    className="w-24 sm:w-32 shrink-0 h-8"
                  />
                </div>

                <h4 className="text-sm font-semibold text-muted-foreground mt-3 mb-1">
                  Categories
                </h4>
                <div className="divide-y">{regularCategories.map(renderCategoryRow)}</div>

                <div className="mt-2 space-y-1 border-t pt-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Allocated</span>
                    <span className="font-medium">{formatCurrency(regularAllocated, 0)}</span>
                  </div>
                  {hasTarget && (
                    overBy > 0 ? (
                      <div className="flex justify-between text-destructive font-medium">
                        <span>Over by</span>
                        <span>{formatCurrency(overBy, 0)}</span>
                      </div>
                    ) : (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Unallocated</span>
                        <span className={unallocated > 0 ? "text-[hsl(160,40%,35%)] font-medium" : "text-muted-foreground"}>
                          {formatCurrency(unallocated, 0)}
                        </span>
                      </div>
                    )
                  )}
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
