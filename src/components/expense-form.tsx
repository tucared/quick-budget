"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { createClient } from "@/lib/supabase"
import { expenseSchema, type ExpenseFormValues } from "@/lib/validations"
import { STORAGE_KEYS, type Category, type Account, type BudgetSummary } from "@/lib/types"
import { convertToEUR, getExchangeRate } from "@/lib/currency"
import { getErrorMessage } from "@/lib/error-handler"
import { getTodayDateString, getCurrentBudgetMonth } from "@/lib/date-utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { CategoryBudgetStatus } from "@/components/category-budget-status"

interface ExpenseFormProps {
  onSuccess?: () => void
}

export function ExpenseForm({ onSuccess }: ExpenseFormProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [showAllCategories, setShowAllCategories] = useState(false)
  const [showAllAccounts, setShowAllAccounts] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [categoryBudget, setCategoryBudget] = useState<BudgetSummary | null>(null)
  const [loadingBudget, setLoadingBudget] = useState(false)
  const [householdId, setHouseholdId] = useState<string | null>(null)

  // Check if we're on mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

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
      amount: 0,
      expense_date: getTodayDateString(),
      currency: "EUR",
    },
  })

  const selectedCategory = watch("category_id")
  const selectedAccount = watch("account_id")
  const selectedCurrency = watch("currency")
  const expenseAmount = watch("amount")

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

  const getRecentlyUsed = (items: Category[] | Account[], usageKey: string, limit = 3): string[] => {
    const usageMap = getUsageMap(usageKey)
    const sorted = items
      .map((item) => ({ id: item.id, lastUsed: usageMap[item.id] || 0 }))
      .sort((a, b) => {
        // Sort by most recent first, then alphabetically for unused items
        if (a.lastUsed === 0 && b.lastUsed === 0) {
          const aName = items.find((i) => i.id === a.id)?.name || ""
          const bName = items.find((i) => i.id === b.id)?.name || ""
          return aName.localeCompare(bName)
        }
        return b.lastUsed - a.lastUsed
      })
    return sorted.slice(0, limit).map((item) => item.id)
  }

  // Load categories and accounts on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const supabase = createClient()

        // Get user's household_id for explicit filtering
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()

        if (authError) {
          setLoadError(getErrorMessage(authError))
          setLoadingData(false)
          return
        }

        if (!user) {
          setLoadError("You must be logged in to add expenses")
          setLoadingData(false)
          return
        }

        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("household_id")
          .eq("id", user.id)
          .single()

        if (userError) {
          setLoadError(getErrorMessage(userError))
          setLoadingData(false)
          return
        }

        if (!userData?.household_id) {
          setLoadError("Could not find your household")
          setLoadingData(false)
          return
        }

        const householdId = userData.household_id
        setHouseholdId(householdId)

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

        // Load accounts with explicit household filter
        const { data: accountsData, error: accountsError } = await supabase
          .from("accounts")
          .select("*")
          .eq("household_id", householdId)
          .eq("is_active", true)
          .order("name")

        if (accountsError) {
          setLoadError(getErrorMessage(accountsError))
          setLoadingData(false)
          return
        }

        if (accountsData) {
          setAccounts(accountsData)
        }

        // Load smart defaults from localStorage
        try {
          const lastCategory = localStorage.getItem(STORAGE_KEYS.LAST_CATEGORY)
          const lastAccount = localStorage.getItem(STORAGE_KEYS.LAST_ACCOUNT)
          const lastCurrency = localStorage.getItem(STORAGE_KEYS.LAST_CURRENCY)

          if (lastCategory) {
            setValue("category_id", lastCategory)
          }

          if (lastAccount) {
            setValue("account_id", lastAccount)
          } else if (accountsData && accountsData.length > 0) {
            // Default to the first account or the default account
            const defaultAccount = accountsData.find((a) => a.is_default)
            setValue("account_id", defaultAccount?.id || accountsData[0].id)
          }

          if (lastCurrency) {
            setValue("currency", lastCurrency)
          }
        } catch (err) {
          // localStorage might be disabled (incognito mode, etc.)
          // Fall back to defaults if available
          if (accountsData && accountsData.length > 0) {
            const defaultAccount = accountsData.find((a) => a.is_default)
            setValue("account_id", defaultAccount?.id || accountsData[0].id)
          }
        }

        setLoadingData(false)
      } catch (err) {
        setLoadError(getErrorMessage(err))
        setLoadingData(false)
      }
    }

    loadData()
  }, [setValue])

  // Load budget status when category is selected
  useEffect(() => {
    const loadCategoryBudget = async () => {
      if (!selectedCategory || !householdId) {
        setCategoryBudget(null)
        return
      }

      // Check if selected category is a monthly category (not long_term)
      const selectedCategoryObj = categories.find((c) => c.id === selectedCategory)
      if (!selectedCategoryObj || selectedCategoryObj.category_type !== "monthly") {
        setCategoryBudget(null)
        return
      }

      setLoadingBudget(true)

      try {
        const supabase = createClient()
        const budgetMonth = getCurrentBudgetMonth()

        const { data, error } = await supabase
          .from("budget_summary")
          .select("*")
          .eq("household_id", householdId)
          .eq("category_id", selectedCategory)
          .eq("budget_month", budgetMonth)
          .single()

        if (error && error.code !== "PGRST116") {
          // PGRST116 = no rows returned, which is fine (no budget set)
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
  }, [selectedCategory, householdId, categories])

  const onSubmit = async (data: ExpenseFormValues) => {
    setError("")
    setSuccessMessage("")
    setLoading(true)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setError("You must be logged in to add expenses")
        setLoading(false)
        return
      }

      // Get user's household_id
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("household_id")
        .eq("id", user.id)
        .single()

      if (userError) {
        setError(getErrorMessage(userError))
        setLoading(false)
        return
      }

      if (!userData?.household_id) {
        setError("Could not find your household. Please contact support.")
        setLoading(false)
        return
      }

      // Convert to EUR for consistent tracking
      const currency = data.currency || "EUR"
      const convertedAmount = convertToEUR(data.amount, currency)
      const exchangeRate = getExchangeRate(currency, "EUR")

      // Insert expense
      const { error: insertError } = await supabase.from("expenses").insert({
        logged_by_user_id: user.id,
        household_id: userData.household_id,
        category_id: data.category_id,
        account_id: data.account_id,
        amount: data.amount,
        currency: currency,
        converted_amount: convertedAmount,
        converted_currency: "EUR",
        exchange_rate: exchangeRate,
        expense_date: data.expense_date,
        description: data.description || null,
      })

      if (insertError) {
        setError(getErrorMessage(insertError))
        setLoading(false)
        return
      }

      // Save defaults to localStorage and track usage
      try {
        localStorage.setItem(STORAGE_KEYS.LAST_CATEGORY, data.category_id)
        localStorage.setItem(STORAGE_KEYS.LAST_ACCOUNT, data.account_id)
        if (data.currency) {
          localStorage.setItem(STORAGE_KEYS.LAST_CURRENCY, data.currency)
        }
        // Track usage frequency
        recordUsage(STORAGE_KEYS.CATEGORY_USAGE, data.category_id)
        recordUsage(STORAGE_KEYS.ACCOUNT_USAGE, data.account_id)
      } catch (err) {
        // localStorage might be disabled, silently fail
        // This is not critical for functionality
      }

      // Show success message briefly
      setSuccessMessage("Expense added!")
      setTimeout(() => setSuccessMessage(""), 2000)

      // Reset form but keep category, account, and date
      reset({
        amount: 0,
        category_id: data.category_id,
        account_id: data.account_id,
        expense_date: data.expense_date,
        description: "",
        currency: data.currency,
      })

      // Focus on amount input for next entry
      const amountInput = document.getElementById("amount") as HTMLInputElement
      if (amountInput) {
        amountInput.focus()
        amountInput.select()
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
      <div className="text-center py-8 text-muted-foreground">
        Loading form...
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

      {successMessage && (
        <div className="p-3 text-sm text-green-700 bg-green-50 rounded-md">
          {successMessage}
        </div>
      )}

      {/* Amount with Currency Toggle */}
      <div className="space-y-2">
        <Label htmlFor="amount">Amount *</Label>
        <div className="flex gap-2">
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            inputMode="decimal"
            autoFocus
            className="flex-1"
            {...register("amount", { valueAsNumber: true })}
          />
          <div className="inline-flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              onClick={() => setValue("currency", "EUR")}
              className={`px-4 py-2 text-sm font-medium border rounded-l-md transition-colors ${
                selectedCurrency === "EUR"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              EUR
            </button>
            <button
              type="button"
              onClick={() => setValue("currency", "BRL")}
              className={`px-4 py-2 text-sm font-medium border-l-0 border rounded-r-md transition-colors ${
                selectedCurrency === "BRL"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              BRL
            </button>
          </div>
        </div>
        {errors.amount && (
          <p className="text-sm text-destructive">{errors.amount.message}</p>
        )}
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label htmlFor="category">Category *</Label>
        {!showAllCategories ? (
          <div className="space-y-2">
            {/* Quick-pick buttons for frequently used categories */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {getRecentlyUsed(categories, STORAGE_KEYS.CATEGORY_USAGE, isMobile ? 2 : 5).map((categoryId) => {
                const category = categories.find((c) => c.id === categoryId)
                if (!category) return null
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setValue("category_id", category.id)
                      setShowAllCategories(false)
                    }}
                    className={`px-3 py-2.5 text-sm font-medium border rounded-md transition-colors flex items-center justify-center ${
                      selectedCategory === category.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-input hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    {category.icon && <span className="mr-1.5">{category.icon}</span>}
                    <span className="truncate">{category.name}</span>
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setShowAllCategories(true)}
                className="px-3 py-2.5 text-sm font-medium border rounded-md transition-colors bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground col-span-2 md:col-span-1"
              >
                Other...
              </button>
            </div>
            {/* Show selected category if it's not in quick picks */}
            {selectedCategory && !getRecentlyUsed(categories, STORAGE_KEYS.CATEGORY_USAGE, isMobile ? 2 : 5).includes(selectedCategory) && (
              <div className="text-sm text-muted-foreground">
                Selected: {categories.find((c) => c.id === selectedCategory)?.name}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Select
              value={selectedCategory}
              onValueChange={(value) => {
                setValue("category_id", value)
                setShowAllCategories(false)
              }}
            >
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.icon && <span className="mr-2">{category.icon}</span>}
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => setShowAllCategories(false)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to quick picks
            </button>
          </div>
        )}
        {errors.category_id && (
          <p className="text-sm text-destructive">
            {errors.category_id.message}
          </p>
        )}
        {/* Budget status preview - only show for monthly categories */}
        {selectedCategory && categories.find((c) => c.id === selectedCategory)?.category_type === "monthly" && (
          <CategoryBudgetStatus
            budget={categoryBudget}
            additionalAmount={expenseAmount > 0 ? convertToEUR(expenseAmount, selectedCurrency || "EUR") : 0}
            loading={loadingBudget}
          />
        )}
      </div>

      {/* Account */}
      <div className="space-y-2">
        <Label htmlFor="account">Account *</Label>
        {!showAllAccounts ? (
          <div className="space-y-2">
            {/* Quick-pick buttons for frequently used accounts */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {getRecentlyUsed(accounts, STORAGE_KEYS.ACCOUNT_USAGE, isMobile ? 2 : 5).map((accountId) => {
                const account = accounts.find((a) => a.id === accountId)
                if (!account) return null
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => {
                      setValue("account_id", account.id)
                      setShowAllAccounts(false)
                    }}
                    className={`px-3 py-2.5 text-sm font-medium border rounded-md transition-colors ${
                      selectedAccount === account.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-input hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    <span className="truncate">{account.name}</span>
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setShowAllAccounts(true)}
                className="px-3 py-2.5 text-sm font-medium border rounded-md transition-colors bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground col-span-2 md:col-span-1"
              >
                Other...
              </button>
            </div>
            {/* Show selected account if it's not in quick picks */}
            {selectedAccount && !getRecentlyUsed(accounts, STORAGE_KEYS.ACCOUNT_USAGE, isMobile ? 2 : 5).includes(selectedAccount) && (
              <div className="text-sm text-muted-foreground">
                Selected: {accounts.find((a) => a.id === selectedAccount)?.name}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Select
              value={selectedAccount}
              onValueChange={(value) => {
                setValue("account_id", value)
                setShowAllAccounts(false)
              }}
            >
              <SelectTrigger id="account">
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => setShowAllAccounts(false)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to quick picks
            </button>
          </div>
        )}
        {errors.account_id && (
          <p className="text-sm text-destructive">
            {errors.account_id.message}
          </p>
        )}
      </div>

      {/* Date */}
      <div className="space-y-2">
        <Label htmlFor="expense_date">Date *</Label>
        <Input
          id="expense_date"
          type="date"
          {...register("expense_date")}
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
          rows={2}
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
        className="w-full h-12 text-lg font-semibold"
        disabled={loading}
      >
        {loading ? "Saving..." : "Save Expense"}
      </Button>
    </form>
  )
}
