"use client"

import { useMemo, useState } from "react"
import { format } from "date-fns"
import { createClient } from "@/lib/supabase"
import { expenseSchema } from "@/lib/validations"
import type { Category, Expense } from "@/lib/types"
import { fetchExchangeRateFromAPI, formatCurrency } from "@/lib/currency"
import { getErrorMessage } from "@/lib/error-handler"
import { deriveCapState, partitionSplitSiblings } from "@/lib/split-utils"
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
  // Default the cap toggle to the row's existing split state. A split being
  // edited stays split; a single row stays single unless the user actively
  // flips the toggle ON when it appears (amount > category's configured cap).
  // Re-arms to ON whenever the category changes (render-time reset below).
  const [applyCap, setApplyCap] = useState(initial.isSplit)
  const [prevCapCategory, setPrevCapCategory] = useState(primaryRow.category_id || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const amount = centsRaw > 0 ? centsRaw / 100 : NaN

  // Edit dialog uses a static exchange_rate derived from the row at log time —
  // re-fetched on save against the (possibly edited) date. For preview we use
  // the stored rate as the best available reference.
  const previewExchangeRate = Number(primaryRow.exchange_rate) || 1

  const selectedCategoryObj = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId],
  )
  const selectedCategoryIsAllowance = selectedCategoryObj?.exclude_from_budget_total === true

  const capDerivation = useMemo(
    () => deriveCapState(selectedCategoryObj, amount, previewExchangeRate),
    [selectedCategoryObj, amount, previewExchangeRate],
  )

  const overflowCategoryName = useMemo(
    () => categories.find((c) => c.id === capDerivation.overflowCategoryId)?.name,
    [categories, capDerivation.overflowCategoryId],
  )

  // Render-time reset when the category changes (React's recommended pattern
  // for derived state — see expense-form.tsx for the matching logic).
  if (categoryId !== prevCapCategory) {
    setPrevCapCategory(categoryId)
    setApplyCap(true)
  }

  const dateAsObject = expenseDate ? new Date(expenseDate + "T00:00:00") : undefined

  const topCategoryIds = useMemo(
    () => categories.slice(0, 7).map((c) => c.id),
    [categories],
  )

  const categoryOptions = useMemo(
    () => buildCategoryOptions(categories),
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

      // Re-derive against the authoritative rate. `wantsSplitNow` may differ
      // from the form's `wantsSplit` if the rate moved between render and save
      // (e.g., overnight rate refresh).
      const submitDerivation = deriveCapState(selectedCategoryObj, data.amount, exchangeRate)
      const wantsSplitNow = submitDerivation.exceedsCap && applyCap && !selectedCategoryIsAllowance
      const wasSplit = initial.isSplit

      // Case 1: was not split → still not split. Simple update.
      if (!wasSplit && !wantsSplitNow) {
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
      else if (!wasSplit && wantsSplitNow) {
        const splitGroupId = crypto.randomUUID()
        const { data: updated, error: updateError } = await supabase
          .from("expenses")
          .update({
            ...sharedFields,
            amount: submitDerivation.primaryOriginal,
            converted_amount: submitDerivation.primaryEUR,
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
            category_id: submitDerivation.overflowCategoryId,
            amount: submitDerivation.overflowOriginal,
            converted_amount: submitDerivation.overflowEUR,
            split_group_id: splitGroupId,
            ...sharedFields,
          })
          .select()
          .single()
        if (insertError) throw insertError
        onSaved?.([updated as Expense, inserted as Expense])
      }

      // Case 3: was split → still split. Update both siblings in parallel.
      // The overflow row's category_id may change if the user picked a new
      // primary category whose configured overflow target differs.
      else if (wasSplit && wantsSplitNow && initialOverflowRow) {
        const [primaryRes, overflowRes] = await Promise.all([
          supabase
            .from("expenses")
            .update({
              ...sharedFields,
              amount: submitDerivation.primaryOriginal,
              converted_amount: submitDerivation.primaryEUR,
              category_id: data.category_id,
            })
            .eq("id", primaryRow.id)
            .select()
            .single(),
          supabase
            .from("expenses")
            .update({
              ...sharedFields,
              amount: submitDerivation.overflowOriginal,
              converted_amount: submitDerivation.overflowEUR,
              category_id: submitDerivation.overflowCategoryId,
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
      else if (wasSplit && !wantsSplitNow && initialOverflowRow) {
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

        {/* Cap-with-overflow toggle. Same model as the expense form: surfaces
            only when the selected category has a cap configured AND the
            entered amount exceeds it (EUR-converted). Cap value and overflow
            target come from the category, not user inputs. */}
        {capDerivation.exceedsCap && !selectedCategoryIsAllowance && (
          <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 cursor-pointer">
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                Cap at {formatCurrency(capDerivation.capEUR, 2, "EUR")}
              </span>
              <span className="text-xs text-muted-foreground">
                Send {formatCurrency(capDerivation.overflowEUR, 2, "EUR")} to{" "}
                {overflowCategoryName ?? "allowance"}
              </span>
            </div>
            <input
              type="checkbox"
              role="switch"
              checked={applyCap}
              onChange={(e) => setApplyCap(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
              aria-label="Apply cap"
            />
          </label>
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
