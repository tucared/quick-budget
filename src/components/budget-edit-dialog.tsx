"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
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
import { Input } from "@/components/ui/input"

interface BudgetEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  householdId: string
  budgetMonth: string // yyyy-MM-dd
}

interface CategoryAmountEntry {
  categoryId: string
  amount: string // string for input control
  existingAllocationId?: string
}

export function BudgetEditDialog({
  open,
  onOpenChange,
  categories,
  householdId,
  budgetMonth,
}: BudgetEditDialogProps) {
  const router = useRouter()
  const [entries, setEntries] = useState<CategoryAmountEntry[]>([])
  const [history, setHistory] = useState<BudgetSummary[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const activeCategories = categories.filter((c) => c.is_active)
  const regularCategories = activeCategories.filter((c) => !c.exclude_from_budget_total)
  const allowanceCategories = activeCategories.filter((c) => c.exclude_from_budget_total)

  // Load current allocations and history when dialog opens
  const loadData = useCallback(async () => {
    if (!open) return
    setLoading(true)
    setError("")

    const supabase = createClient()

    // Fetch current allocations and 3-month history in parallel
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

    // Build entries from active categories, pre-filling with existing allocations
    const newEntries = activeCategories.map((cat) => {
      const existing = allocations.find((a) => a.category_id === cat.id)
      return {
        categoryId: cat.id,
        amount: existing ? String(Number(existing.allocated_amount)) : "",
        existingAllocationId: existing?.id,
      }
    })
    setEntries(newEntries)
    setLoading(false)
  }, [open, householdId, budgetMonth, activeCategories])

  useEffect(() => {
    loadData()
  }, [open, householdId, budgetMonth]) // eslint-disable-line react-hooks/exhaustive-deps

  function updateAmount(categoryId: string, value: string) {
    // Allow empty or valid numeric input
    if (value !== "" && !/^\d*\.?\d{0,2}$/.test(value)) return
    setEntries((prev) =>
      prev.map((e) => (e.categoryId === categoryId ? { ...e, amount: value } : e))
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
        const prevAlloc = prevAllocations.find(
          (a) => a.category_id === entry.categoryId
        )
        return prevAlloc
          ? { ...entry, amount: String(Number(prevAlloc.allocated_amount)) }
          : entry
      })
    )
  }

  async function handleSave() {
    setSaving(true)
    setError("")

    const supabase = createClient()

    // Split entries into upserts (amount > 0) and deletes (amount cleared/0)
    const toUpsert = entries.filter(
      (e) => e.amount !== "" && Number(e.amount) > 0
    )
    const toDelete = entries.filter(
      (e) => (e.amount === "" || Number(e.amount) === 0) && e.existingAllocationId
    )

    try {
      // Upsert allocations
      if (toUpsert.length > 0) {
        const { error: upsertError } = await supabase
          .from("budget_allocations")
          .upsert(
            toUpsert.map((e) => ({
              household_id: householdId,
              category_id: e.categoryId,
              budget_month: budgetMonth,
              allocated_amount: Number(e.amount),
              currency: "EUR",
            })),
            { onConflict: "household_id,category_id,budget_month" }
          )
        if (upsertError) {
          setError(getErrorMessage(upsertError))
          setSaving(false)
          return
        }
      }

      // Delete cleared allocations
      if (toDelete.length > 0) {
        const deleteIds = toDelete
          .map((e) => e.existingAllocationId!)
        const { error: deleteError } = await supabase
          .from("budget_allocations")
          .delete()
          .in("id", deleteIds)
        if (deleteError) {
          setError(getErrorMessage(deleteError))
          setSaving(false)
          return
        }
      }

      onOpenChange(false)
      router.refresh()
    } catch {
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const regularTotal = entries
    .filter((e) => regularCategories.some((c) => c.id === e.categoryId))
    .reduce((sum, e) => sum + (e.amount ? Number(e.amount) : 0), 0)

  function renderCategoryRow(cat: Category) {
    const entry = entries.find((e) => e.categoryId === cat.id)
    if (!entry) return null
    return (
      <div key={cat.id} className="flex items-center gap-3 py-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {cat.icon && <span className="text-lg shrink-0">{cat.icon}</span>}
          <span className="text-sm font-medium truncate">{cat.name}</span>
        </div>
        <div className="hidden sm:block">
          <BudgetHistoryMini categoryId={cat.id} history={history} />
        </div>
        <div className="w-28 shrink-0">
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={entry.amount}
            onChange={(e) => updateAmount(cat.id, e.target.value)}
            className="text-right h-8"
          />
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              <Button
                variant="outline"
                size="sm"
                onClick={copyFromPreviousMonth}
              >
                Copy from previous month
              </Button>
            </div>

            {/* Regular categories */}
            {regularCategories.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2">
                  Categories
                </h4>
                <div className="divide-y">
                  {regularCategories.map(renderCategoryRow)}
                </div>
                <div className="flex justify-between items-center pt-2 text-sm font-semibold">
                  <span>Subtotal</span>
                  <span>{formatCurrency(regularTotal, 0)}</span>
                </div>
              </div>
            )}

            {/* Allowances */}
            {allowanceCategories.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2">
                  Allowances
                </h4>
                <div className="divide-y">
                  {allowanceCategories.map(renderCategoryRow)}
                </div>
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
