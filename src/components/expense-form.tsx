"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, X } from "lucide-react"
import { format, startOfMonth, getDaysInMonth } from "date-fns"
import { createClient } from "@/lib/supabase"
import { expenseSchema } from "@/lib/validations"
import { getStorageKeys, type Category, type Expense, type BudgetSummary } from "@/lib/types"
import { fetchExchangeRateFromAPI, formatCurrency } from "@/lib/currency"
import { getErrorMessage } from "@/lib/error-handler"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { CategoryBudgetCard } from "@/components/category-budget-card"
import { CategoryTileSelector, buildCategoryOptions } from "@/components/category-tile-selector"
import { AmountInputWithCurrency, type AmountInputHandle } from "@/components/amount-input-with-currency"
import { DatePicker } from "@/components/ui/date-picker"
import { useUser } from "@/lib/contexts/user-context"
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value"

interface ExpenseFormProps {
  onExpenseSaved?: (expense: Expense | Expense[]) => void
  initialCategories?: Category[]
  initialTopCategoryIds?: string[]
  /**
   * Monotonic counter bumped by the parent on external expense changes
   * (partner inserts, deletes, etc.). Triggers a refresh of the inline
   * budget preview without opening a second realtime channel here.
   */
  externalRefreshSignal?: number
}

export function ExpenseForm({ onExpenseSaved, initialCategories, initialTopCategoryIds, externalRefreshSignal }: ExpenseFormProps) {
  const { user } = useUser()
  const householdId = user?.householdId
  const storageKeys = useMemo(
    () => (householdId ? getStorageKeys(householdId) : null),
    [householdId]
  )
  const [categories, setCategories] = useState<Category[]>(initialCategories ?? [])
  const [loading, setLoading] = useState(false)
  const [loadState, setLoadState] = useState<
    { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: string }
  >(initialCategories === undefined ? { status: 'loading' } : { status: 'idle' })
  const [error, setError] = useState("")
  const [showSuccess, setShowSuccess] = useState(false)
  const [topCategoryIds, setTopCategoryIds] = useState<string[]>(initialTopCategoryIds ?? [])
  const [categoryBudget, setCategoryBudget] = useState<BudgetSummary | null>(null)
  const [overflowCategoryBudget, setOverflowCategoryBudget] = useState<BudgetSummary | null>(null)
  const [loadingBudget, setLoadingBudget] = useState(false)
  const [budgetRefreshTick, setBudgetRefreshTick] = useState(0)
  const [previewExchangeRate, setPreviewExchangeRate] = useState<number>(1.0)
  const debouncedBudgetRefreshTick = useDebouncedValue(budgetRefreshTick, 500)

  // Cents-first input state (POS-style: digits fill from the right)
  const [centsRaw, setCentsRaw] = useState(0)

  // Cap-with-overflow split state (JTBD #8). When `splitExpanded` is on and
  // capCentsRaw < total amount and overflowCategoryId is set, save inserts
  // two sibling rows sharing a split_group_id (cap → primary, rest → overflow).
  const [splitExpanded, setSplitExpanded] = useState(false)
  const [capCentsRaw, setCapCentsRaw] = useState(0)
  const [overflowCategoryId, setOverflowCategoryId] = useState<string>("")

  // Ref for the amount input — used to refocus after currency toggles
  const amountInputRef = useRef<AmountInputHandle | null>(null)

  // Ref for the description textarea
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null)

  // Ref to store success state timer for cleanup
  const successTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Form state (replaces React Hook Form)
  const [amount, setAmount] = useState<number>(NaN)
  const [categoryId, setCategoryId] = useState<string>("")
  const [currency, setCurrency] = useState<string>("EUR")
  const [isCash, setIsCash] = useState<boolean>(false)
  const [expenseDate, setExpenseDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [description, setDescription] = useState<string>("")
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // Aliases for readability in the template
  const selectedCategory = categoryId
  const selectedCurrency = currency
  const expenseAmount = amount

  const effectiveExchangeRate = (!selectedCurrency || selectedCurrency === "EUR") ? 1.0 : previewExchangeRate

  const selectedCategoryIsAllowance = useMemo(() => {
    const c = categories.find((cat) => cat.id === selectedCategory)
    return c?.exclude_from_budget_total === true
  }, [categories, selectedCategory])

  const capAmount = capCentsRaw > 0 ? capCentsRaw / 100 : 0
  const overflowAmount =
    Number.isFinite(expenseAmount) && expenseAmount > 0 && capAmount > 0 && capAmount < expenseAmount
      ? expenseAmount - capAmount
      : 0
  // A split actually happens only when the disclosure is open, the cap is
  // strictly less than the total, and an overflow category is chosen.
  const isSplit =
    splitExpanded &&
    overflowAmount > 0 &&
    overflowCategoryId !== "" &&
    overflowCategoryId !== selectedCategory
  const primaryPortion = isSplit ? capAmount : expenseAmount
  const debouncedPrimaryPortion = useDebouncedValue(primaryPortion, 300)
  const debouncedOverflowAmount = useDebouncedValue(overflowAmount, 300)

  // Convert string date to Date object for DatePicker
  const dateAsObject = expenseDate ? new Date(expenseDate + "T00:00:00") : undefined

  const handleCentsChange = (next: number) => {
    setCentsRaw(next)
    setAmount(next > 0 ? next / 100 : NaN)
  }

  // Helper functions for tracking usage recency (timestamp-based)
  const getUsageMap = (key: string): Record<string, number> => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  }

  const recordUsage = (key: string, id: string) => {
    try {
      const usageMap = getUsageMap(key)
      usageMap[id] = Date.now() // Store timestamp of last use
      localStorage.setItem(key, JSON.stringify(usageMap))
    } catch {
      // localStorage might be disabled
    }
  }

  const getCategoryOptions = () =>
    buildCategoryOptions(
      categories,
      storageKeys ? getUsageMap(storageKeys.CATEGORY_USAGE) : {}
    )

  // Load form data on mount. When initialCategories + initialTopCategoryIds are
  // provided by the server, skip the Supabase fetches entirely — only apply
  // localStorage defaults (synchronous, no network).
  useEffect(() => {
    const loadData = async () => {
      if (!user?.householdId) {
        setLoadState({ status: 'idle' })
        return
      }

      const householdId = user.householdId

      try {
        if (initialCategories === undefined) {
          // Fallback: fetch categories client-side (standalone usage without server props)
          const supabase = createClient()

          const { data: categoriesData, error: categoriesError } = await supabase
            .from("categories")
            .select("*")
            .eq("household_id", householdId)
            .eq("is_active", true)
            .order("name")

          if (categoriesError) {
            setLoadState({ status: 'error', error: getErrorMessage(categoriesError) })
            return
          }

          if (categoriesData) {
            setCategories(categoriesData)
            // Fallback ordering when no server-provided top category IDs are
            // available — just take the first 7. Callers that care about
            // recency-ranked ordering should pass initialTopCategoryIds.
            setTopCategoryIds(categoriesData.slice(0, 7).map((c) => c.id))
          }
        }

        // Load smart defaults from localStorage (namespaced by household)
        try {
          const keys = getStorageKeys(householdId)
          const lastCategory = localStorage.getItem(keys.LAST_CATEGORY)
          const lastCurrency = localStorage.getItem(keys.LAST_CURRENCY)

          if (lastCategory) {
            setCategoryId(lastCategory)
          }

          if (lastCurrency) {
            setCurrency(lastCurrency)
          }
        } catch (_err) {
          // localStorage might be disabled (incognito mode, etc.)
        }

        setLoadState({ status: 'idle' })
      } catch (err) {
        setLoadState({ status: 'error', error: getErrorMessage(err) })
      }
    }

    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Load budget status when category is selected
  useEffect(() => {
    const loadCategoryBudget = async () => {
      if (!selectedCategory || !user?.householdId) {
        setCategoryBudget(null)
        return
      }

      const selectedCategoryObj = categories.find((c) => c.id === selectedCategory)
      if (!selectedCategoryObj) {
        setCategoryBudget(null)
        return
      }

      // Only show loading skeleton on initial load (no data at all).
      // When switching categories, keep showing stale data to avoid blink.
      if (!categoryBudget) {
        setLoadingBudget(true)
      }

      try {
        const supabase = createClient()
        const budgetMonth = format(startOfMonth(new Date(expenseDate + 'T00:00:00')), 'yyyy-MM-dd')

        const { data, error } = await supabase
          .from("budget_summary")
          .select("*")
          .eq("household_id", user.householdId)
          .eq("category_id", selectedCategory)
          .eq("budget_month", budgetMonth)
          .maybeSingle()

        if (error) {
          // maybeSingle returns null when no rows found, only errors on actual failures
          console.error("Error loading category budget:", error)
        }

        setCategoryBudget(data || null)
        setLoadingBudget(false)
      } catch (err) {
        console.error("Error loading category budget:", err)
        setCategoryBudget(null)
        setLoadingBudget(false)
      }
    }

    loadCategoryBudget()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- categoryBudget intentionally excluded to avoid refetch loop
  }, [selectedCategory, user, categories, debouncedBudgetRefreshTick, expenseDate])

  // Mirror the above for the overflow category when a split is active.
  useEffect(() => {
    if (!isSplit || !overflowCategoryId || !user?.householdId) return
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const budgetMonth = format(startOfMonth(new Date(expenseDate + 'T00:00:00')), 'yyyy-MM-dd')
      const { data } = await supabase
        .from("budget_summary")
        .select("*")
        .eq("household_id", user.householdId)
        .eq("category_id", overflowCategoryId)
        .eq("budget_month", budgetMonth)
        .maybeSingle()
      if (!cancelled) setOverflowCategoryBudget(data || null)
    })()
    return () => { cancelled = true }
  }, [isSplit, overflowCategoryId, user, debouncedBudgetRefreshTick, expenseDate])

  // Drop the stale overflow-budget snapshot the moment the split is turned off
  // so the second CategoryBudgetCard doesn't render with a "no budget set"
  // placeholder on next re-expand.
  const overflowBudgetToShow = isSplit ? overflowCategoryBudget : null

  // Fetch exchange rate for budget preview when currency or date changes
  useEffect(() => {
    if (!selectedCurrency || selectedCurrency === "EUR") return
    let cancelled = false
    fetchExchangeRateFromAPI(selectedCurrency, expenseDate).then((rate) => {
      if (!cancelled) setPreviewExchangeRate(rate)
    })
    return () => { cancelled = true }
  }, [selectedCurrency, expenseDate])

  // Refresh budget status when the parent signals an external expense change
  // (partner added/deleted/updated). The parent owns the realtime subscription
  // so this component doesn't open a second channel on the same household.
  useEffect(() => {
    if (externalRefreshSignal === undefined) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBudgetRefreshTick((t) => t + 1)
  }, [externalRefreshSignal])

  // Cleanup success state timer on unmount
  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current)
      }
    }
  }, [])

  const onSubmit = async () => {
    setError("")
    setFormErrors({})

    // Validate with Zod
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
    setLoading(true)

    if (!user?.id || !user?.householdId) {
      setError("You must be logged in to add expenses")
      setLoading(false)
      return
    }

    // Pre-flight: if the user expanded the split disclosure but didn't pick an
    // overflow category, surface that as a field error rather than silently
    // saving a single row.
    if (splitExpanded && overflowAmount > 0 && !overflowCategoryId) {
      setFormErrors({ overflow_category_id: "Pick an overflow category" })
      return
    }

    try {
      const supabase = createClient()

      // Convert to EUR for consistent tracking
      const cur = data.currency || "EUR"

      // Fetch exchange rate from API (with database caching)
      const exchangeRate = await fetchExchangeRateFromAPI(cur, data.expense_date)
      const sharedFields = {
        logged_by_user_id: user.id,
        household_id: user.householdId,
        is_cash: data.is_cash ?? false,
        currency: cur,
        converted_currency: "EUR",
        exchange_rate: exchangeRate,
        expense_date: data.expense_date,
        description: data.description || null,
      } as const

      let savedRows: Expense[] | null = null
      if (isSplit) {
        const splitGroupId = crypto.randomUUID()
        const overflow = data.amount - capAmount
        const rows = [
          {
            ...sharedFields,
            category_id: data.category_id,
            amount: capAmount,
            converted_amount: capAmount * exchangeRate,
            split_group_id: splitGroupId,
          },
          {
            ...sharedFields,
            category_id: overflowCategoryId,
            amount: overflow,
            converted_amount: overflow * exchangeRate,
            split_group_id: splitGroupId,
          },
        ]
        const { data: inserted, error: insertError } = await supabase
          .from("expenses")
          .insert(rows)
          .select()
        if (insertError) {
          setError(getErrorMessage(insertError))
          setLoading(false)
          return
        }
        savedRows = (inserted ?? []) as Expense[]
      } else {
        const { data: savedExpense, error: insertError } = await supabase
          .from("expenses")
          .insert({
            ...sharedFields,
            category_id: data.category_id,
            amount: data.amount,
            converted_amount: data.amount * exchangeRate,
          })
          .select()
          .single()
        if (insertError) {
          setError(getErrorMessage(insertError))
          setLoading(false)
          return
        }
        savedRows = savedExpense ? [savedExpense as Expense] : null
      }

      // Notify parent immediately for optimistic list update
      if (savedRows && savedRows.length > 0 && onExpenseSaved) {
        onExpenseSaved(savedRows.length === 1 ? savedRows[0] : savedRows)
      }

      // Save defaults to localStorage and track usage (namespaced by household)
      try {
        if (storageKeys) {
          localStorage.setItem(storageKeys.LAST_CATEGORY, data.category_id)
          if (data.currency) {
            localStorage.setItem(storageKeys.LAST_CURRENCY, data.currency)
          }
          // Track usage frequency
          recordUsage(storageKeys.CATEGORY_USAGE, data.category_id)
        }
      } catch (_err) {
        // localStorage might be disabled, silently fail
        // This is not critical for functionality
      }

      // Refresh budget status for the same category
      setBudgetRefreshTick((t) => t + 1)

      // Show success state in button
      setShowSuccess(true)
      // Clear any existing timer before setting a new one
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current)
      }
      successTimerRef.current = setTimeout(() => setShowSuccess(false), 1500)

      // Reset form but keep category, currency, and date
      setCentsRaw(0)
      setAmount(NaN)
      setDescription("")
      // Collapse the split disclosure after save so the next entry defaults
      // back to a normal one-row expense. Keep the cap value in case the user
      // wants to reuse the same split for the next entry.
      setSplitExpanded(false)

      // Focus on amount input for next entry
      if (amountInputRef.current) {
        amountInputRef.current.focus()
        amountInputRef.current.select()
      }

      setLoading(false)
    } catch (err) {
      setError(getErrorMessage(err))
      setLoading(false)
    }
  }

  if (loadState.status === 'loading') {
    return (
      <div className="space-y-4">
        {/* Amount + currency toggle Skeleton */}
        <Skeleton className="h-16 w-full" />

        {/* Category tile grid Skeleton */}
        <div className="grid grid-cols-4 gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>

        {/* Date + Cash row Skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-5 w-16" />
        </div>

        {/* Description Skeleton */}
        <Skeleton className="h-20 w-full" />

        {/* Submit Button Skeleton */}
        <Skeleton className="h-11 w-full" />
      </div>
    )
  }

  if (loadState.status === 'error') {
    return (
      <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
        {loadState.error}
      </div>
    )
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit() }} className="space-y-3">
      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {error}
        </div>
      )}

      {/* Amount - hero cents-first input with inline currency toggle */}
      <div>
        <AmountInputWithCurrency
          ref={amountInputRef}
          centsRaw={centsRaw}
          onCentsChange={handleCentsChange}
          currency={selectedCurrency}
          onCurrencyChange={setCurrency}
          error={!!formErrors.amount}
          autoFocus
          onEnter={() => descriptionRef.current?.focus()}
        />
        {formErrors.amount && (
          <p className="text-sm text-destructive mt-1">{formErrors.amount}</p>
        )}
      </div>

      {/* Category - tile grid for quick selection */}
      <div className="space-y-1.5" aria-label="Category">
        <CategoryTileSelector
          categories={categories}
          topCategoryIds={topCategoryIds}
          value={selectedCategory}
          onValueChange={(value) => setCategoryId(value)}
          allOptions={getCategoryOptions()}
        />
        {formErrors.category_id && (
          <p className="text-sm text-destructive">
            {formErrors.category_id}
          </p>
        )}
        {/* Budget status preview - animated to prevent jarring layout shift */}
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-out"
          style={{ gridTemplateRows: selectedCategory ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden space-y-2">
            {selectedCategory && (
              <>
                <CategoryBudgetCard
                  budget={categoryBudget}
                  isCurrentMonth={format(startOfMonth(new Date(expenseDate + 'T00:00:00')), 'yyyy-MM-dd') === format(startOfMonth(new Date()), 'yyyy-MM-dd')}
                  dayOfMonth={new Date(expenseDate + 'T00:00:00').getDate()}
                  daysInMonth={getDaysInMonth(new Date(expenseDate + 'T00:00:00'))}
                  additionalAmount={debouncedPrimaryPortion > 0 ? debouncedPrimaryPortion * effectiveExchangeRate : 0}
                  loading={loadingBudget}
                />
                {isSplit && (
                  <CategoryBudgetCard
                    budget={overflowBudgetToShow}
                    showHeader
                    isCurrentMonth={format(startOfMonth(new Date(expenseDate + 'T00:00:00')), 'yyyy-MM-dd') === format(startOfMonth(new Date()), 'yyyy-MM-dd')}
                    dayOfMonth={new Date(expenseDate + 'T00:00:00').getDate()}
                    daysInMonth={getDaysInMonth(new Date(expenseDate + 'T00:00:00'))}
                    additionalAmount={debouncedOverflowAmount > 0 ? debouncedOverflowAmount * effectiveExchangeRate : 0}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cap-with-overflow disclosure (JTBD #8). Only meaningful when the
          primary category is a shared/spending category — capping an
          allowance and overflowing to another allowance is not a real use
          case. The disclosure toggle is hidden until the user has picked a
          shared category and entered a positive amount. */}
      {selectedCategory && !selectedCategoryIsAllowance && expenseAmount > 0 && (
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
                <label htmlFor="cap-amount" className="text-muted-foreground shrink-0">Cap at</label>
                <input
                  id="cap-amount"
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
                <span className="text-xs text-muted-foreground">{selectedCurrency}</span>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Overflow to</p>
                <CategoryTileSelector
                  categories={categories.filter((c) => c.exclude_from_budget_total)}
                  topCategoryIds={categories.filter((c) => c.exclude_from_budget_total).slice(0, 7).map((c) => c.id)}
                  value={overflowCategoryId}
                  onValueChange={setOverflowCategoryId}
                  allOptions={buildCategoryOptions(categories.filter((c) => c.exclude_from_budget_total))}
                />
                {formErrors.overflow_category_id && (
                  <p className="text-sm text-destructive">{formErrors.overflow_category_id}</p>
                )}
              </div>

              {isSplit && (() => {
                const primaryCat = categories.find((c) => c.id === selectedCategory)
                const overflowCat = categories.find((c) => c.id === overflowCategoryId)
                return (
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(capAmount, 2, selectedCurrency)} → {primaryCat?.name || "primary"}, {formatCurrency(overflowAmount, 2, selectedCurrency)} → {overflowCat?.name || "overflow"}
                  </p>
                )
              })()}
              {splitExpanded && overflowAmount === 0 && capAmount > 0 && expenseAmount > 0 && capAmount >= expenseAmount && (
                <p className="text-xs text-muted-foreground">Cap covers the full amount — no overflow.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Date + Cash checkbox inline */}
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
              aria-label="Expense date"
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
          <p className="text-sm text-destructive mt-1">
            {formErrors.expense_date}
          </p>
        )}
      </div>

      {/* Description (optional) */}
      <div>
        <Textarea
          ref={descriptionRef}
          id="description"
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
          <p className="text-sm text-destructive">
            {formErrors.description}
          </p>
        )}
      </div>

      {/* Submit Button - Large touch target for mobile */}
      <Button
        type="submit"
        className="w-full h-11 text-base font-semibold transition-colors"
        disabled={loading || showSuccess}
      >
        {showSuccess ? (
          <span className="flex items-center gap-2">
            <Check className="h-5 w-5" />
            Saved!
          </span>
        ) : loading ? (
          "Saving..."
        ) : (
          "Save Expense"
        )}
      </Button>
      <div aria-live="polite" className="sr-only">
        {showSuccess ? "Expense saved successfully" : ""}
      </div>
    </form>
  )
}
