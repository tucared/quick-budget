"use client"

import { useMemo, useState } from "react"
import { format } from "date-fns"
import { X } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { expenseSchema } from "@/lib/validations"
import type { Category, Expense } from "@/lib/types"
import { fetchExchangeRateFromAPI, formatCurrency } from "@/lib/currency"
import { getErrorMessage } from "@/lib/error-handler"
import { partitionSplitSiblings } from "@/lib/split-utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { CategoryTileSelector, buildCategoryOptions } from "@/components/category-tile-selector"
import { AmountInputWithCurrency } from "@/components/amount-input-with-currency"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface EditExpenseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * One or two expense rows. A single row means a regular expense; two rows
   * with a shared split_group_id mean a split. The dialog edits the whole
   * group as a unit.
   */
  siblings: Expense[] | null
  categories: Category[]
  onSaved?: (updated: Expense | Expense[]) => void
  onDeleted?: (ids: string[]) => void
}

export function EditExpenseDialog({
  open,
  onOpenChange,
  siblings,
  categories,
  onSaved,
  onDeleted,
}: EditExpenseDialogProps) {
  if (!siblings || siblings.length === 0) return null

  const keyParts = siblings.map((s) => s.id + s.updated_at).join("|")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <EditExpenseForm
          key={keyParts}
          siblings={siblings}
          categories={categories}
          onOpenChange={onOpenChange}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      </DialogContent>
    </Dialog>
  )
}

interface EditExpenseFormProps {
  siblings: Expense[]
  categories: Category[]
  onOpenChange: (open: boolean) => void
  onSaved?: (updated: Expense | Expense[]) => void
  onDeleted?: (ids: string[]) => void
}

function EditExpenseForm({
  siblings,
  categories,
  onOpenChange,
  onSaved,
  onDeleted,
}: EditExpenseFormProps) {
  const excludeFlags = useMemo(() => {
    const map = new Map<string, boolean>()
    categories.forEach((c) => map.set(c.id, c.exclude_from_budget_total))
    return map
  }, [categories])

  // Identify the primary (capped) and overflow (allowance) siblings up-front
  // so re-renders preserve which row is which. Without this we'd risk
  // swapping their semantics mid-edit if amounts change.
  const initial = useMemo(() => {
    if (siblings.length === 2) {
      const { primary, overflow } = partitionSplitSiblings(
        { siblings: [siblings[0], siblings[1]] as const },
        excludeFlags,
      )
      return { primary, overflow, isSplit: true }
    }
    return { primary: siblings[0], overflow: null, isSplit: false }
  }, [siblings, excludeFlags])

  const primaryRow = initial.primary
  const initialOverflowRow = initial.overflow

  const initialTotal =
    Math.abs(Number(primaryRow.amount)) +
    (initialOverflowRow ? Math.abs(Number(initialOverflowRow.amount)) : 0)

  const [centsRaw, setCentsRaw] = useState(() => Math.round(initialTotal * 100))
  const [categoryId, setCategoryId] = useState(primaryRow.category_id || "")
  const [currency, setCurrency] = useState(primaryRow.currency)
  const [isCash, setIsCash] = useState(primaryRow.is_cash)
  const [expenseDate, setExpenseDate] = useState(primaryRow.expense_date)
  const [description, setDescription] = useState(primaryRow.description || "")
  const [splitExpanded, setSplitExpanded] = useState(initial.isSplit)
  const [capCentsRaw, setCapCentsRaw] = useState(() =>
    Math.round(Math.abs(Number(primaryRow.amount)) * 100),
  )
  const [overflowCategoryId, setOverflowCategoryId] = useState(
    initialOverflowRow?.category_id || "",
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const amount = centsRaw > 0 ? centsRaw / 100 : NaN
  const capAmount = capCentsRaw > 0 ? capCentsRaw / 100 : 0
  const overflowAmount =
    Number.isFinite(amount) && amount > 0 && capAmount > 0 && capAmount < amount
      ? amount - capAmount
      : 0
  const wantsSplit =
    splitExpanded &&
    overflowAmount > 0 &&
    overflowCategoryId !== "" &&
    overflowCategoryId !== categoryId

  const selectedCategoryIsAllowance =
    categories.find((c) => c.id === categoryId)?.exclude_from_budget_total === true

  const dateAsObject = expenseDate ? new Date(expenseDate + "T00:00:00") : undefined

  const topCategoryIds = useMemo(
    () => categories.slice(0, 7).map((c) => c.id),
    [categories],
  )

  const categoryOptions = useMemo(
    () => buildCategoryOptions(categories),
    [categories],
  )

  const allowanceCategories = useMemo(
    () => categories.filter((c) => c.exclude_from_budget_total),
    [categories],
  )

  const handleSave = async () => {
    setError("")
    setFormErrors({})

    const result = expenseSchema.safeParse({
      amount,
      category_id: categoryId,
      currency,
      is_cash: isCash,
      expense_date: expenseDate,
      description: description || undefined,
    })

    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0] as string
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setFormErrors(fieldErrors)
      return
    }

    if (splitExpanded && overflowAmount > 0 && !overflowCategoryId) {
      setFormErrors({ overflow_category_id: "Pick an overflow category" })
      return
    }

    const data = result.data
    setSaving(true)

    try {
      const cur = data.currency || "EUR"
      const exchangeRate = await fetchExchangeRateFromAPI(cur, data.expense_date)
      const supabase = createClient()

      const sharedFields = {
        currency: cur,
        converted_currency: "EUR",
        exchange_rate: exchangeRate,
        is_cash: data.is_cash ?? false,
        expense_date: data.expense_date,
        description: data.description || null,
      } as const

      const wasSplit = initial.isSplit

      // Case 1: was not split → still not split. Simple update.
      if (!wasSplit && !wantsSplit) {
        const { data: updated, error: updateError } = await supabase
          .from("expenses")
          .update({
            ...sharedFields,
            amount: data.amount,
            converted_amount: data.amount * exchangeRate,
            category_id: data.category_id,
          })
          .eq("id", primaryRow.id)
          .select()
          .single()
        if (updateError) throw updateError
        onSaved?.(updated as Expense)
      }

      // Case 2: was not split → now split. Update primary to the capped
      // amount + mint split_group_id, then insert the overflow sibling. Run
      // the update first so a failed insert leaves the row in a consistent
      // (non-split, full-amount-on-primary) state.
      else if (!wasSplit && wantsSplit) {
        const splitGroupId = crypto.randomUUID()
        const { data: updated, error: updateError } = await supabase
          .from("expenses")
          .update({
            ...sharedFields,
            amount: capAmount,
            converted_amount: capAmount * exchangeRate,
            category_id: data.category_id,
            split_group_id: splitGroupId,
          })
          .eq("id", primaryRow.id)
          .select()
          .single()
        if (updateError) throw updateError
        const { data: inserted, error: insertError } = await supabase
          .from("expenses")
          .insert({
            logged_by_user_id: primaryRow.logged_by_user_id,
            household_id: primaryRow.household_id,
            category_id: overflowCategoryId,
            amount: overflowAmount,
            converted_amount: overflowAmount * exchangeRate,
            split_group_id: splitGroupId,
            ...sharedFields,
          })
          .select()
          .single()
        if (insertError) throw insertError
        onSaved?.([updated as Expense, inserted as Expense])
      }

      // Case 3: was split → still split. Update both siblings in parallel.
      else if (wasSplit && wantsSplit && initialOverflowRow) {
        const [primaryRes, overflowRes] = await Promise.all([
          supabase
            .from("expenses")
            .update({
              ...sharedFields,
              amount: capAmount,
              converted_amount: capAmount * exchangeRate,
              category_id: data.category_id,
            })
            .eq("id", primaryRow.id)
            .select()
            .single(),
          supabase
            .from("expenses")
            .update({
              ...sharedFields,
              amount: overflowAmount,
              converted_amount: overflowAmount * exchangeRate,
              category_id: overflowCategoryId,
            })
            .eq("id", initialOverflowRow.id)
            .select()
            .single(),
        ])
        if (primaryRes.error) throw primaryRes.error
        if (overflowRes.error) throw overflowRes.error
        onSaved?.([primaryRes.data as Expense, overflowRes.data as Expense])
      }

      // Case 4: was split → no longer split. Update primary to full amount +
      // clear split_group_id, then delete the overflow sibling.
      else if (wasSplit && !wantsSplit && initialOverflowRow) {
        const { data: updated, error: updateError } = await supabase
          .from("expenses")
          .update({
            ...sharedFields,
            amount: data.amount,
            converted_amount: data.amount * exchangeRate,
            category_id: data.category_id,
            split_group_id: null,
          })
          .eq("id", primaryRow.id)
          .select()
          .single()
        if (updateError) throw updateError
        const { error: deleteError } = await supabase
          .from("expenses")
          .delete()
          .eq("id", initialOverflowRow.id)
        if (deleteError) throw deleteError
        onSaved?.(updated as Expense)
        onDeleted?.([initialOverflowRow.id])
      }

      setSaving(false)
      onOpenChange(false)
    } catch (err) {
      setError(getErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{initial.isSplit ? "Edit Split Expense" : "Edit Expense"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {error && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
            {error}
          </div>
        )}

        {/* Amount with currency toggle */}
        <div>
          <AmountInputWithCurrency
            centsRaw={centsRaw}
            onCentsChange={setCentsRaw}
            currency={currency}
            onCurrencyChange={setCurrency}
            error={!!formErrors.amount}
          />
          {formErrors.amount && (
            <p className="text-sm text-destructive mt-1">{formErrors.amount}</p>
          )}
        </div>

        {/* Category */}
        <div className="space-y-1.5" aria-label="Category">
          <CategoryTileSelector
            categories={categories}
            topCategoryIds={topCategoryIds}
            value={categoryId}
            onValueChange={setCategoryId}
            allOptions={categoryOptions}
          />
          {formErrors.category_id && (
            <p className="text-sm text-destructive">{formErrors.category_id}</p>
          )}
        </div>

        {/* Cap-with-overflow disclosure */}
        {categoryId && !selectedCategoryIsAllowance && amount > 0 && (
          <div className="space-y-2">
            {!splitExpanded ? (
              <button
                type="button"
                onClick={() => setSplitExpanded(true)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Cap &amp; send overflow to allowance…
              </button>
            ) : (
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Split this expense</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSplitExpanded(false)
                      setFormErrors((prev) => {
                        const { overflow_category_id: _, ...rest } = prev
                        return rest
                      })
                    }}
                    aria-label="Cancel split"
                    className="p-0.5 text-muted-foreground hover:text-foreground rounded"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <label htmlFor="edit-cap-amount" className="text-muted-foreground shrink-0">Cap at</label>
                  <input
                    id="edit-cap-amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={capCentsRaw > 0 ? (capCentsRaw / 100).toString() : ""}
                    onChange={(e) => {
                      const parsed = parseFloat(e.target.value)
                      setCapCentsRaw(Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0)
                    }}
                    className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <span className="text-xs text-muted-foreground">{currency}</span>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Overflow to</p>
                  <CategoryTileSelector
                    categories={allowanceCategories}
                    topCategoryIds={allowanceCategories.slice(0, 7).map((c) => c.id)}
                    value={overflowCategoryId}
                    onValueChange={setOverflowCategoryId}
                    allOptions={buildCategoryOptions(allowanceCategories)}
                  />
                  {formErrors.overflow_category_id && (
                    <p className="text-sm text-destructive">{formErrors.overflow_category_id}</p>
                  )}
                </div>

                {wantsSplit && (() => {
                  const primaryCat = categories.find((c) => c.id === categoryId)
                  const overflowCat = categories.find((c) => c.id === overflowCategoryId)
                  return (
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(capAmount, 2, currency)} → {primaryCat?.name || "primary"}, {formatCurrency(overflowAmount, 2, currency)} → {overflowCat?.name || "overflow"}
                    </p>
                  )
                })()}
                {splitExpanded && overflowAmount === 0 && capAmount > 0 && amount > 0 && capAmount >= amount && (
                  <p className="text-xs text-muted-foreground">Cap covers the full amount — no overflow.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Date + Cash */}
        <div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <DatePicker
                date={dateAsObject}
                onDateChange={(date) => {
                  if (date) {
                    setExpenseDate(format(date, 'yyyy-MM-dd'))
                  }
                }}
                placeholder="Select expense date"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isCash}
                onChange={(e) => setIsCash(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Cash
            </label>
          </div>
          {formErrors.expense_date && (
            <p className="text-sm text-destructive mt-1">{formErrors.expense_date}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <Textarea
            placeholder="Optional notes about this expense"
            rows={1}
            className="min-h-0 resize-none overflow-hidden"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = "auto"
              el.style.height = `${el.scrollHeight}px`
            }}
          />
          {formErrors.description && (
            <p className="text-sm text-destructive">{formErrors.description}</p>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </DialogFooter>
    </>
  )
}
