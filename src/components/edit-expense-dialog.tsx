"use client"

import { useMemo, useState } from "react"
import { format } from "date-fns"
import { createClient } from "@/lib/supabase"
import { expenseSchema } from "@/lib/validations"
import type { Category, Expense } from "@/lib/types"
import { fetchExchangeRateFromAPI } from "@/lib/currency"
import { getErrorMessage } from "@/lib/error-handler"
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
  expense: Expense | null
  categories: Category[]
  onSaved?: (updated: Expense) => void
}

export function EditExpenseDialog({
  open,
  onOpenChange,
  expense,
  categories,
  onSaved,
}: EditExpenseDialogProps) {
  if (!expense) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <EditExpenseForm
          key={expense.id + expense.updated_at}
          expense={expense}
          categories={categories}
          onOpenChange={onOpenChange}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  )
}

interface EditExpenseFormProps {
  expense: Expense
  categories: Category[]
  onOpenChange: (open: boolean) => void
  onSaved?: (updated: Expense) => void
}

function EditExpenseForm({
  expense,
  categories,
  onOpenChange,
  onSaved,
}: EditExpenseFormProps) {
  const [centsRaw, setCentsRaw] = useState(() => Math.round(Math.abs(expense.amount) * 100))
  const [categoryId, setCategoryId] = useState(expense.category_id || "")
  const [currency, setCurrency] = useState(expense.currency)
  const [isCash, setIsCash] = useState(expense.is_cash)
  const [expenseDate, setExpenseDate] = useState(expense.expense_date)
  const [description, setDescription] = useState(expense.description || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const amount = centsRaw > 0 ? centsRaw / 100 : NaN

  const dateAsObject = expenseDate ? new Date(expenseDate + "T00:00:00") : undefined

  const topCategoryIds = useMemo(
    () => categories.slice(0, 7).map((c) => c.id),
    [categories]
  )

  const categoryOptions = useMemo(
    () => buildCategoryOptions(categories),
    [categories]
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
      const convertedAmount = data.amount * exchangeRate

      const supabase = createClient()
      const updates = {
        amount: data.amount,
        currency: cur,
        converted_amount: convertedAmount,
        converted_currency: "EUR",
        exchange_rate: exchangeRate,
        category_id: data.category_id,
        is_cash: data.is_cash ?? false,
        expense_date: data.expense_date,
        description: data.description || null,
      }
      const { data: updated, error: updateError } = await supabase
        .from("expenses")
        .update(updates)
        .eq("id", expense.id)
        .select()
        .single()

      if (updateError) {
        setError(getErrorMessage(updateError))
        setSaving(false)
        return
      }

      setSaving(false)
      onOpenChange(false)
      // Optimistic update — postgres_changes realtime is unreliable on this
      // project, so the parent re-renders immediately from this callback.
      if (updated) onSaved?.(updated as Expense)
    } catch (err) {
      setError(getErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit Expense</DialogTitle>
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
