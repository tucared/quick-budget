"use client"

import { useEffect, useMemo, useState } from "react"
import { format, startOfMonth, getDaysInMonth } from "date-fns"
import { createClient } from "@/lib/supabase"
import { expenseSchema } from "@/lib/validations"
import { getStorageKeys, type BudgetSummary, type Category, type Expense } from "@/lib/types"
import { fetchExchangeRateFromAPI } from "@/lib/currency"
import { getErrorMessage } from "@/lib/error-handler"
import { deriveCapState, partitionSplitSiblings, round2 } from "@/lib/split-utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { CategoryBudgetCard } from "@/components/category-budget-card"
import { CategoryTileSelector, buildCategoryOptions } from "@/components/category-tile-selector"
import { AmountInputWithCurrency } from "@/components/amount-input-with-currency"
import { DatePicker } from "@/components/ui/date-picker"
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value"
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
  // The allowance the overflow portion lands in. For an existing split, seeded
  // from the existing overflow row's category. For not-yet-split rows, seeded
  // from the user's last pick in localStorage (falls back to the first
  // allowance at render time). Sticky across category changes.
  const [selectedOverflowId, setSelectedOverflowId] = useState<string | null>(() => {
    if (initialOverflowRow?.category_id) return initialOverflowRow.category_id
    if (typeof window === "undefined") return null
    try {
      return localStorage.getItem(getStorageKeys(primaryRow.household_id).LAST_OVERFLOW)
    } catch {
      return null
    }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  // Non-blocking notice shown when a save had to use a static fallback
  // exchange rate (rate API down). The save still goes through; the dialog
  // stays open so the warning is actually seen.
  const [rateWarning, setRateWarning] = useState("")
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const amount = centsRaw > 0 ? centsRaw / 100 : NaN

  // Edit dialog uses a static exchange_rate derived from the row at log time —
  // re-fetched on save only when the currency or date changed (see
  // handleSave). For preview we use the stored rate as the best available
  // reference.
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

  // Allowance categories — used to render the per-log picker switch when the
  // cap toggle is on.
  const allowanceCategories = useMemo(
    () => categories.filter((c) => c.exclude_from_budget_total),
    [categories],
  )

  // Effective overflow target: the user's stored pick if it still matches an
  // active allowance, else the first allowance.
  const effectiveOverflowCategoryId = useMemo(() => {
    const stored = selectedOverflowId
      ? allowanceCategories.find((c) => c.id === selectedOverflowId)?.id
      : undefined
    return stored ?? allowanceCategories[0]?.id ?? null
  }, [selectedOverflowId, allowanceCategories])

  // Mirror the expense form's split derivation. `isSplit` drives the inline
  // budget-bar treatment; `showCapControl` decides whether the "Cap" checkbox
  // surfaces on the category bar.
  const isSplit = capDerivation.exceedsCap && applyCap && allowanceCategories.length > 0
  const showCapControl =
    capDerivation.exceedsCap && !selectedCategoryIsAllowance && allowanceCategories.length > 0

  // Slice (in the entered currency) each bar represents. Debounced so the bar
  // animation doesn't jitter while typing — matches the expense form.
  const primaryPortion = isSplit ? capDerivation.primaryOriginal : amount
  const overflowPortion = isSplit ? capDerivation.overflowOriginal : 0
  const debouncedPrimaryPortion = useDebouncedValue(primaryPortion, 300)
  const debouncedOverflowPortion = useDebouncedValue(overflowPortion, 300)

  // Live budget previews for the capped category and the overflow allowance.
  const [primaryBudget, setPrimaryBudget] = useState<BudgetSummary | null>(null)
  const [overflowBudget, setOverflowBudget] = useState<BudgetSummary | null>(null)
  const [loadingBudget, setLoadingBudget] = useState(false)

  const budgetMonth = useMemo(
    () => format(startOfMonth(new Date(expenseDate + "T00:00:00")), "yyyy-MM-dd"),
    [expenseDate],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!categoryId) {
        setPrimaryBudget(null)
        return
      }
      setLoadingBudget(true)
      const supabase = createClient()
      const { data } = await supabase
        .from("budget_summary")
        .select("*")
        .eq("household_id", primaryRow.household_id)
        .eq("category_id", categoryId)
        .eq("budget_month", budgetMonth)
        .maybeSingle()
      if (!cancelled) {
        setPrimaryBudget(data || null)
        setLoadingBudget(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [categoryId, budgetMonth, primaryRow.household_id])

  useEffect(() => {
    if (!isSplit || !effectiveOverflowCategoryId) return
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("budget_summary")
        .select("*")
        .eq("household_id", primaryRow.household_id)
        .eq("category_id", effectiveOverflowCategoryId)
        .eq("budget_month", budgetMonth)
        .maybeSingle()
      if (!cancelled) setOverflowBudget(data || null)
    })()
    return () => {
      cancelled = true
    }
  }, [isSplit, effectiveOverflowCategoryId, budgetMonth, primaryRow.household_id])

  // The expense being edited is already counted in budget_summary. Rebase a
  // fetched bar by removing this expense's own existing EUR contribution to the
  // category so the preview reflects the edited amount instead of double-
  // counting it. A category the original rows never touched (e.g. the user
  // moved this expense here) is returned unchanged.
  const originalEurInCategory = (catId: string | null): number => {
    if (!catId) return 0
    let sum = 0
    if (primaryRow.category_id === catId) sum += Math.abs(Number(primaryRow.converted_amount))
    if (initialOverflowRow?.category_id === catId)
      sum += Math.abs(Number(initialOverflowRow.converted_amount))
    return sum
  }
  const rebaseBudget = (
    budget: BudgetSummary | null,
    catId: string | null,
  ): BudgetSummary | null => {
    if (!budget) return null
    const own = originalEurInCategory(catId)
    if (own === 0) return budget
    return {
      ...budget,
      spent_amount: Number(budget.spent_amount) - own,
      remaining_amount: Number(budget.remaining_amount) + own,
    }
  }

  const rebasedPrimaryBudget = rebaseBudget(primaryBudget, categoryId)
  // Drop the stale overflow snapshot the moment the split is turned off so the
  // bar doesn't flash a "no budget set" placeholder on re-expand.
  const rebasedOverflowBudget = isSplit
    ? rebaseBudget(overflowBudget, effectiveOverflowCategoryId)
    : null

  const isCurrentMonth =
    budgetMonth === format(startOfMonth(new Date()), "yyyy-MM-dd")
  const dayOfMonth = new Date(expenseDate + "T00:00:00").getDate()
  const daysInMonth = getDaysInMonth(new Date(expenseDate + "T00:00:00"))

  // Render-time reset of the cap toggle when the category changes. The
  // overflow allowance pick is sticky — it's a user preference, not a per-
  // category default.
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
    setRateWarning("")
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
      // Re-fetch the rate only when the inputs that determine it changed.
      // Editing unrelated fields (description, category, amount) reuses the
      // row's stored historical rate — an unconditional re-fetch could
      // silently rewrite a correct rate with a static fallback whenever the
      // rate API happens to be down.
      const rateInputsChanged =
        cur !== primaryRow.currency || data.expense_date !== primaryRow.expense_date
      let exchangeRate = Number(primaryRow.exchange_rate) || 1
      let usedFallbackRate = false
      if (rateInputsChanged) {
        const fetched = await fetchExchangeRateFromAPI(cur, data.expense_date)
        exchangeRate = fetched.rate
        usedFallbackRate = fetched.isFallback
      }
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
      const wantsSplitNow =
        submitDerivation.exceedsCap &&
        applyCap &&
        !selectedCategoryIsAllowance &&
        !!effectiveOverflowCategoryId
      const wasSplit = initial.isSplit
      const overflowCategoryIdToUse = effectiveOverflowCategoryId

      // Case 1: was not split → still not split. Simple update.
      if (!wasSplit && !wantsSplitNow) {
        const { data: updated, error: updateError } = await supabase
          .from("expenses")
          .update({
            ...sharedFields,
            amount: data.amount,
            converted_amount: round2(data.amount * exchangeRate),
            category_id: data.category_id,
          })
          .eq("id", primaryRow.id)
          .select()
          .single()
        if (updateError) throw updateError
        onSaved?.(updated as Expense)
      }

      // Case 2: was not split → now split. Insert the overflow sibling first,
      // then shrink the primary to the capped amount + split_group_id. This
      // order means a partial failure can only leave a transient double-count
      // (visible, fixable), never silently lose the overflow portion of the
      // spend — which is what update-first would do if the insert failed.
      else if (!wasSplit && wantsSplitNow) {
        const splitGroupId = crypto.randomUUID()
        const { data: inserted, error: insertError } = await supabase
          .from("expenses")
          .insert({
            logged_by_user_id: primaryRow.logged_by_user_id,
            household_id: primaryRow.household_id,
            category_id: overflowCategoryIdToUse,
            amount: submitDerivation.overflowOriginal,
            converted_amount: submitDerivation.overflowEUR,
            split_group_id: splitGroupId,
            ...sharedFields,
          })
          .select()
          .single()
        if (insertError) throw insertError
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
        if (updateError) {
          // Best-effort rollback of the just-inserted overflow so the failure
          // state is the original single full-amount row; if the delete also
          // fails, the double-count is at least visible in the list.
          await supabase.from("expenses").delete().eq("id", (inserted as Expense).id)
          throw updateError
        }
        onSaved?.([updated as Expense, inserted as Expense])
      }

      // Case 3: was split → still split. Update both siblings in parallel.
      // The overflow row's category_id may change if the user picks a
      // different allowance via the pill picker.
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
              category_id: overflowCategoryIdToUse,
            })
            .eq("id", initialOverflowRow.id)
            .select()
            .single(),
        ])
        if (primaryRes.error) throw primaryRes.error
        if (overflowRes.error) throw overflowRes.error
        onSaved?.([primaryRes.data as Expense, overflowRes.data as Expense])
      }

      // Case 4: was split → no longer split. Update primary to the full
      // amount + clear split_group_id FIRST, then delete the overflow
      // sibling. If the delete fails, the failure state is a transient
      // double-count (visible, and self-healing — the thrown error keeps the
      // dialog open so retrying re-runs the same update + delete). The
      // reverse order would lose the overflow portion if the update failed.
      else if (wasSplit && !wantsSplitNow && initialOverflowRow) {
        const { data: updated, error: updateError } = await supabase
          .from("expenses")
          .update({
            ...sharedFields,
            amount: data.amount,
            converted_amount: round2(data.amount * exchangeRate),
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

      // Remember the chosen allowance for the next split entry. Only fires
      // when this save actually wrote a split — case 1 and case 4 don't
      // express any allowance choice.
      if (wantsSplitNow && overflowCategoryIdToUse) {
        try {
          localStorage.setItem(
            getStorageKeys(primaryRow.household_id).LAST_OVERFLOW,
            overflowCategoryIdToUse,
          )
        } catch {
          // localStorage might be disabled
        }
      }

      setSaving(false)
      if (usedFallbackRate) {
        // The save went through, but with an approximate rate — keep the
        // dialog open so the notice is seen rather than closing silently.
        setRateWarning("Saved with an approximate exchange rate — live rate unavailable")
      } else {
        onOpenChange(false)
      }
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

        {rateWarning && (
          <div className="px-2.5 py-2 bg-[hsl(36,40%,94%)] border border-[hsl(36,30%,78%)] rounded-md text-xs text-[hsl(24,85%,42%)]">
            {rateWarning}
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

        {/* Budget status preview — same inline treatment as the expense form.
            The capped category bar carries the inline "Cap" checkbox (surfaces
            when the amount exceeds the category's cap and there's an allowance
            to overflow into); the overflow allowance bar carries the per-
            allowance icon buttons and the (€) fraction shows each slice. Bars
            are rebased to drop this expense's own existing contribution so the
            preview reflects the edit, not a double-count. */}
        {categoryId && (
          <div className="space-y-2">
            <CategoryBudgetCard
              budget={rebasedPrimaryBudget}
              compact
              showFraction={isSplit}
              trailing={
                showCapControl ? (
                  <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={applyCap}
                      onChange={(e) => setApplyCap(e.target.checked)}
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    Cap
                  </label>
                ) : undefined
              }
              isCurrentMonth={isCurrentMonth}
              dayOfMonth={dayOfMonth}
              daysInMonth={daysInMonth}
              additionalAmount={debouncedPrimaryPortion > 0 ? debouncedPrimaryPortion * previewExchangeRate : 0}
              loading={loadingBudget}
            />
            {isSplit && (
              <CategoryBudgetCard
                budget={rebasedOverflowBudget}
                compact
                showFraction
                trailing={
                  allowanceCategories.length > 1 ? (
                    <div className="flex gap-1">
                      {allowanceCategories.map((a) => {
                        const active = a.id === effectiveOverflowCategoryId
                        return (
                          <button
                            type="button"
                            key={a.id}
                            onClick={() => setSelectedOverflowId(a.id)}
                            className={`h-6 w-6 rounded text-sm border flex items-center justify-center transition-colors ${
                              active
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border hover:border-foreground"
                            }`}
                            aria-label={`Send overflow to ${a.name}`}
                            aria-pressed={active}
                          >
                            {a.icon}
                          </button>
                        )
                      })}
                    </div>
                  ) : undefined
                }
                isCurrentMonth={isCurrentMonth}
                dayOfMonth={dayOfMonth}
                daysInMonth={daysInMonth}
                additionalAmount={debouncedOverflowPortion > 0 ? debouncedOverflowPortion * previewExchangeRate : 0}
              />
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
            placeholder="Expense description"
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
