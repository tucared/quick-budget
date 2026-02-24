"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Check } from "lucide-react"
import { format, startOfMonth } from "date-fns"
import { createClient } from "@/lib/supabase"
import { expenseSchema, type ExpenseFormValues } from "@/lib/validations"
import { getStorageKeys, type Category, type Expense, type BudgetSummary } from "@/lib/types"
import { convertToEUR, fetchExchangeRateFromAPI } from "@/lib/currency"
import { getErrorMessage } from "@/lib/error-handler"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { CategoryBudgetStatus } from "@/components/category-budget-status"
import { type GroupedOption } from "@/components/grouped-combobox"
import { CategoryTileSelector } from "@/components/category-tile-selector"
import { DatePicker } from "@/components/ui/date-picker"
import { useUser } from "@/lib/contexts/user-context"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useExpenseSubscription } from "@/lib/hooks/use-expense-subscription"

interface ExpenseFormProps {
  onSuccess?: () => void
  onExpenseSaved?: (expense: Expense) => void
}

export function ExpenseForm({ onSuccess, onExpenseSaved }: ExpenseFormProps) {
  const { user } = useUser()
  const storageKeys = useMemo(
    () => (user?.householdId ? getStorageKeys(user.householdId) : null),
    [user?.householdId]
  )
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [error, setError] = useState("")
  const [showSuccess, setShowSuccess] = useState(false)
  const [topCategoryIds, setTopCategoryIds] = useState<string[]>([])
  const [categoryBudget, setCategoryBudget] = useState<BudgetSummary | null>(null)
  const [loadingBudget, setLoadingBudget] = useState(false)
  const [budgetRefreshTick, setBudgetRefreshTick] = useState(0)

  // Cents-first input state (POS-style: digits fill from the right)
  const [centsRaw, setCentsRaw] = useState(0)

  // Ref for the invisible input that captures keyboard events
  const amountInputRef = useRef<HTMLInputElement | null>(null)

  // Ref to store success state timer for cleanup
  const successTimerRef = useRef<NodeJS.Timeout | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      amount: NaN,
      expense_date: format(new Date(), 'yyyy-MM-dd'),
      currency: "EUR",
      is_cash: false,
    },
  })

  const selectedCategory = watch("category_id")
  const selectedCurrency = watch("currency")
  const isCash = watch("is_cash")
  const expenseAmount = watch("amount")
  const expenseDate = watch("expense_date")

  // Debounce the amount for budget calculations to avoid re-rendering on every keystroke
  const debouncedAmount = useDebouncedValue(expenseAmount, 300)

  // Convert string date to Date object for DatePicker
  const dateAsObject = expenseDate ? new Date(expenseDate + "T00:00:00") : undefined

  // Format cents as "1 234,56" style display
  const formatCentsDisplay = (cents: number): string => {
    if (cents === 0) return "0,00"
    const intPart = Math.floor(cents / 100)
    const decPart = cents % 100
    const intFormatted = intPart.toLocaleString("fr-FR")
    return `${intFormatted},${String(decPart).padStart(2, "0")}`
  }

  const handleAmountKeyDown = (e: React.KeyboardEvent) => {
    if (e.key >= "0" && e.key <= "9") {
      e.preventDefault()
      const next = centsRaw * 10 + parseInt(e.key)
      if (next <= 999999999) { // cap at ~10M
        setCentsRaw(next)
        setValue("amount", next / 100, { shouldValidate: true })
      }
    } else if (e.key === "Backspace") {
      e.preventDefault()
      const next = Math.floor(centsRaw / 10)
      setCentsRaw(next)
      setValue("amount", next > 0 ? next / 100 : NaN, { shouldValidate: false })
    }
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

  // Transform categories into grouped options with frequency
  const getCategoryOptions = (): GroupedOption[] => {
    const usageMap = storageKeys ? getUsageMap(storageKeys.CATEGORY_USAGE) : {}

    return categories.map((category) => ({
      value: category.id,
      label: category.name,
      icon: category.icon || undefined,
      group: category.exclude_from_budget_total ? "Allowances" : "Spending",
      frequency: usageMap[category.id] || 0,
    }))
  }

  // Load categories on mount
  useEffect(() => {
    const loadData = async () => {
      if (!user?.householdId) {
        setLoadingData(false)
        return
      }

      try {
        const supabase = createClient()
        const householdId = user.householdId

        // Load categories with explicit household filter
        const { data: categoriesData, error: categoriesError } = await supabase
          .from("categories")
          .select("*")
          .eq("household_id", householdId)
          .eq("is_active", true)
          .order("name")

        if (categoriesError) {
          setLoadError(getErrorMessage(categoriesError))
          setLoadingData(false)
          return
        }

        if (categoriesData) {
          setCategories(categoriesData)
        }

        // Fetch top categories by expense count in the last 30 days
        const thirtyDaysAgo = format(
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          "yyyy-MM-dd"
        )
        const { data: recentExpenses } = await supabase
          .from("expenses")
          .select("category_id")
          .eq("household_id", householdId)
          .gte("expense_date", thirtyDaysAgo)

        if (recentExpenses && categoriesData) {
          // Count expenses per category
          const counts: Record<string, number> = {}
          for (const exp of recentExpenses) {
            if (exp.category_id) {
              counts[exp.category_id] = (counts[exp.category_id] || 0) + 1
            }
          }

          // Active category IDs for filtering
          const activeCategoryIds = new Set(categoriesData.map((c) => c.id))

          // Rank by count descending, take top 5
          const ranked = Object.entries(counts)
            .filter(([id]) => activeCategoryIds.has(id))
            .sort((a, b) => b[1] - a[1])
            .map(([id]) => id)
            .slice(0, 5)

          // If fewer than 5, fill with remaining active categories alphabetically
          if (ranked.length < 5) {
            const rankedSet = new Set(ranked)
            const fillers = categoriesData
              .filter((c) => !rankedSet.has(c.id))
              .map((c) => c.id)
              .slice(0, 5 - ranked.length)
            ranked.push(...fillers)
          }

          setTopCategoryIds(ranked)
        }

        // Load smart defaults from localStorage (namespaced by household)
        try {
          const keys = getStorageKeys(householdId)
          const lastCategory = localStorage.getItem(keys.LAST_CATEGORY)
          const lastCurrency = localStorage.getItem(keys.LAST_CURRENCY)

          if (lastCategory) {
            setValue("category_id", lastCategory)
          }

          if (lastCurrency) {
            setValue("currency", lastCurrency)
          }
        } catch (_err) {
          // localStorage might be disabled (incognito mode, etc.)
        }

        setLoadingData(false)
      } catch (err) {
        setLoadError(getErrorMessage(err))
        setLoadingData(false)
      }
    }

    loadData()
  }, [setValue, user])

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

      // Only show loading skeleton on initial load, not on refreshes (stale-while-revalidate)
      if (!categoryBudget || categoryBudget.category_id !== selectedCategory) {
        setLoadingBudget(true)
      }

      try {
        const supabase = createClient()
        const budgetMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd')

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
  }, [selectedCategory, user, categories, budgetRefreshTick])

  // Refresh budget status when any expense changes externally (partner added/deleted/updated)
  useExpenseSubscription(() => {
    setBudgetRefreshTick((t) => t + 1)
  })

  // Cleanup success state timer on unmount
  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current)
      }
    }
  }, [])

  const onSubmit = async (data: ExpenseFormValues) => {
    setError("")
    setLoading(true)

    if (!user?.id || !user?.householdId) {
      setError("You must be logged in to add expenses")
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()

      // Convert to EUR for consistent tracking
      const currency = data.currency || "EUR"

      // Fetch exchange rate from API (with database caching)
      const exchangeRate = await fetchExchangeRateFromAPI(currency, data.expense_date)
      const convertedAmount = data.amount * exchangeRate

      // Insert expense and return the saved row
      const { data: savedExpense, error: insertError } = await supabase.from("expenses").insert({
        logged_by_user_id: user.id,
        household_id: user.householdId,
        category_id: data.category_id,
        is_cash: data.is_cash ?? false,
        amount: data.amount,
        currency: currency,
        converted_amount: convertedAmount,
        converted_currency: "EUR",
        exchange_rate: exchangeRate,
        expense_date: data.expense_date,
        description: data.description || null,
      }).select().single()

      if (insertError) {
        setError(getErrorMessage(insertError))
        setLoading(false)
        return
      }

      // Notify parent immediately for optimistic list update
      if (savedExpense && onExpenseSaved) {
        onExpenseSaved(savedExpense)
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
      reset({
        amount: NaN,
        category_id: data.category_id,
        is_cash: data.is_cash,
        expense_date: data.expense_date,
        description: "",
        currency: data.currency,
      })

      // Focus on amount input for next entry
      if (amountInputRef.current) {
        amountInputRef.current.focus()
        amountInputRef.current.select()
      }

      // Call onSuccess callback
      if (onSuccess) {
        onSuccess()
      }

      setLoading(false)
    } catch (err) {
      setError(getErrorMessage(err))
      setLoading(false)
    }
  }

  if (loadingData) {
    return (
      <div className="space-y-4">
        {/* Amount + currency toggle Skeleton */}
        <Skeleton className="h-14 w-full" />

        {/* Category tile grid Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[3.25rem] w-full rounded-lg" />
            ))}
          </div>
        </div>

        {/* Date Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-10 w-full" />
        </div>

        {/* Description Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-20 w-full" />
        </div>

        {/* Cash checkbox Skeleton */}
        <Skeleton className="h-5 w-32" />

        {/* Submit Button Skeleton */}
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
        {loadError}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {error}
        </div>
      )}

      {/* Amount - hero cents-first input with inline currency toggle */}
      <div>
        <div
          className={`flex items-center h-14 rounded-md border bg-background px-3 gap-2 cursor-text focus-within:ring-2 focus-within:ring-ring ${errors.amount ? "border-destructive" : "border-input"}`}
          onClick={() => amountInputRef.current?.focus()}
        >
          {/* Invisible input that captures keyboard events */}
          <input
            ref={amountInputRef}
            type="text"
            inputMode="none"
            autoFocus
            autoComplete="off"
            readOnly
            onKeyDown={handleAmountKeyDown}
            className="sr-only"
            aria-label="Amount"
          />
          {/* Display */}
          <span className={`flex-1 text-2xl font-semibold text-center tabular-nums ${centsRaw === 0 ? "text-muted-foreground" : ""}`}>
            {formatCentsDisplay(centsRaw)}
          </span>
          {/* Currency toggle inline */}
          <div className="inline-flex rounded-md shrink-0" role="group">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setValue("currency", "EUR"); amountInputRef.current?.focus() }}
              className={`px-2.5 py-1 text-xs font-semibold border rounded-l-md transition-colors ${
                selectedCurrency === "EUR"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-input hover:bg-accent"
              }`}
            >
              EUR
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setValue("currency", "BRL"); amountInputRef.current?.focus() }}
              className={`px-2.5 py-1 text-xs font-semibold border-l-0 border rounded-r-md transition-colors ${
                selectedCurrency === "BRL"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-input hover:bg-accent"
              }`}
            >
              BRL
            </button>
          </div>
        </div>
        {errors.amount && (
          <p className="text-sm text-destructive mt-1">{errors.amount.message}</p>
        )}
      </div>

      {/* Category - tile grid for quick selection */}
      <div className="space-y-2">
        <Label htmlFor="category">Category *</Label>
        <CategoryTileSelector
          categories={categories}
          topCategoryIds={topCategoryIds}
          value={selectedCategory}
          onValueChange={(value) => setValue("category_id", value)}
          allOptions={getCategoryOptions()}
        />
        {errors.category_id && (
          <p className="text-sm text-destructive">
            {errors.category_id.message}
          </p>
        )}
        {/* Budget status preview */}
        {selectedCategory && (
          <CategoryBudgetStatus
            budget={categoryBudget}
            additionalAmount={debouncedAmount > 0 ? convertToEUR(debouncedAmount, selectedCurrency || "EUR") : 0}
            loading={loadingBudget}
          />
        )}
      </div>

      {/* Date + Cash checkbox */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="expense_date">Date *</Label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isCash}
              onChange={(e) => setValue("is_cash", e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            Cash
          </label>
        </div>
        <DatePicker
          date={dateAsObject}
          onDateChange={(date) => {
            if (date) {
              setValue("expense_date", format(date, 'yyyy-MM-dd'))
            }
          }}
          placeholder="Select expense date"
        />
        {errors.expense_date && (
          <p className="text-sm text-destructive">
            {errors.expense_date.message}
          </p>
        )}
      </div>

      {/* Description (optional) */}
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Optional notes about this expense"
          rows={1}
          className="min-h-0 resize-none overflow-hidden"
          onInput={(e) => {
            const el = e.currentTarget
            el.style.height = "auto"
            el.style.height = `${el.scrollHeight}px`
          }}
          {...register("description")}
        />
        {errors.description && (
          <p className="text-sm text-destructive">
            {errors.description.message}
          </p>
        )}
      </div>

      {/* Submit Button - Large touch target for mobile */}
      <Button
        type="submit"
        className="w-full h-12 text-lg font-semibold transition-colors"
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
    </form>
  )
}
