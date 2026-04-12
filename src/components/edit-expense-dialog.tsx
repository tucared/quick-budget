"use client"

import { useMemo, useRef, useState } from "react"
import { format } from "date-fns"
import { createClient } from "@/lib/supabase"
import { expenseSchema } from "@/lib/validations"
import type { Category, Expense } from "@/lib/types"
import { fetchExchangeRateFromAPI } from "@/lib/currency"
import { getErrorMessage } from "@/lib/error-handler"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { CategoryTileSelector, type GroupedOption } from "@/components/category-tile-selector"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatCentsDisplay } from "@/components/ui/cents-input"

interface EditExpenseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  expense: Expense | null
  categories: Category[]
  onSuccess?: () => void
}

export function EditExpenseDialog({
  open,
  onOpenChange,
  expense,
  categories,
  onSuccess,
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
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  )
}

interface EditExpenseFormProps {
  expense: Expense
  categories: Category[]
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

function EditExpenseForm({
  expense,
  categories,
  onOpenChange,
  onSuccess,
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

  const amountInputRef = useRef<HTMLInputElement | null>(null)

  const amount = centsRaw > 0 ? centsRaw / 100 : NaN

  const dateAsObject = expenseDate ? new Date(expenseDate + "T00:00:00") : undefined

  const topCategoryIds = useMemo(
    () => categories.slice(0, 7).map((c) => c.id),
    [categories]
  )

  const categoryOptions: GroupedOption[] = useMemo(
    () =>
      categories.map((c) => ({
        value: c.id,
        label: c.name,
        icon: c.icon || undefined,
        group: c.exclude_from_budget_total ? "Allowances" : "Spending",
        frequency: 0,
      })),
    [categories]
  )

  const handleAmountKeyDown = (e: React.KeyboardEvent) => {
    const allowedKeys = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (allowedKeys.includes(e.key)) return
    if (e.key >= '0' && e.key <= '9') return
    if (e.ctrlKey || e.metaKey) return
    if (e.key === 'Unidentified') return
    e.preventDefault()
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '')
    const next = parseInt(raw, 10) || 0
    if (next <= 999999999) {
      setCentsRaw(next)
    }
  }

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
      const { error: updateError } = await supabase
        .from("expenses")
        .update({
          amount: data.amount,
          currency: cur,
          converted_amount: convertedAmount,
          converted_currency: "EUR",
          exchange_rate: exchangeRate,
          category_id: data.category_id,
          is_cash: data.is_cash ?? false,
          expense_date: data.expense_date,
          description: data.description || null,
        })
        .eq("id", expense.id)

      if (updateError) {
        setError(getErrorMessage(updateError))
        setSaving(false)
        return
      }

      setSaving(false)
      onOpenChange(false)
      onSuccess?.()
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
          <div
            className={`flex items-center h-16 rounded-md border bg-background px-3 gap-2 cursor-text focus-within:ring-2 focus-within:ring-ring ${formErrors.amount ? "border-destructive" : "border-input"}`}
            onClick={() => amountInputRef.current?.focus()}
          >
            <input
              ref={amountInputRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={centsRaw > 0 ? String(centsRaw) : ""}
              onChange={handleAmountChange}
              onKeyDown={handleAmountKeyDown}
              className="sr-only"
              aria-label="Amount"
            />
            <span className={`flex-1 text-3xl font-semibold text-center tabular-nums ${centsRaw === 0 ? "text-muted-foreground" : ""}`}>
              {formatCentsDisplay(centsRaw)}
            </span>
            <div className="inline-flex rounded-md shrink-0" role="group">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setCurrency("EUR"); amountInputRef.current?.focus() }}
                className={`px-2.5 py-1 text-xs font-semibold border rounded-l-md transition-colors ${
                  currency === "EUR"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-input hover:bg-accent"
                }`}
              >
                EUR
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setCurrency("BRL"); amountInputRef.current?.focus() }}
                className={`px-2.5 py-1 text-xs font-semibold border-l-0 border rounded-r-md transition-colors ${
                  currency === "BRL"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-input hover:bg-accent"
                }`}
              >
                BRL
              </button>
            </div>
          </div>
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
