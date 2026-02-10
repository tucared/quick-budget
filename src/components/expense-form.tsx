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
import { Textarea } from "@/components/ui/textarea"
import { CategoryBudgetStatus } from "@/components/category-budget-status"
import { GroupedCombobox, type GroupedOption } from "@/components/grouped-combobox"
import { useUser } from "@/lib/contexts/user-context"

interface ExpenseFormProps {
  onSuccess?: () => void
}

interface AccountWithUser extends Account {
  owner_name?: string
}

export function ExpenseForm({ onSuccess }: ExpenseFormProps) {
  const { user } = useUser()
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<AccountWithUser[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [categoryBudget, setCategoryBudget] = useState<BudgetSummary | null>(null)
  const [loadingBudget, setLoadingBudget] = useState(false)


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

  // Transform categories into grouped options with frequency
  const getCategoryOptions = (): GroupedOption[] => {
    const usageMap = getUsageMap(STORAGE_KEYS.CATEGORY_USAGE)

    return categories.map((category) => ({
      value: category.id,
      label: category.name,
      icon: category.icon || undefined,
      group: category.exclude_from_budget_total ? "Allowances" : "Spending",
      frequency: usageMap[category.id] || 0,
    }))
  }

  // Transform accounts into grouped options with frequency
  const getAccountOptions = (): GroupedOption[] => {
    const usageMap = getUsageMap(STORAGE_KEYS.ACCOUNT_USAGE)

    return accounts.map((account) => ({
      value: account.id,
      label: account.name,
      group: account.owner_name || "Unknown",
      frequency: usageMap[account.id] || 0,
    }))
  }

  // Load categories and accounts on mount
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

        // Load accounts with explicit household filter
        const { data: accountsData, error: accountsError } = await supabase
          .from("accounts")
          .select("*, users!accounts_owner_user_id_fkey(full_name)")
          .eq("household_id", householdId)
          .eq("is_active", true)
          .order("name")

        if (accountsError) {
          setLoadError(getErrorMessage(accountsError))
          setLoadingData(false)
          return
        }

        if (accountsData) {
          // Transform accounts data to include owner name
          const accountsWithOwner: AccountWithUser[] = accountsData.map((account: any) => ({
            ...account,
            owner_name: account.users?.full_name || "Unknown",
          }))
          setAccounts(accountsWithOwner)
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
  }, [setValue, user])

  // Load budget status when category is selected
  useEffect(() => {
    const loadCategoryBudget = async () => {
      if (!selectedCategory || !user?.householdId) {
        setCategoryBudget(null)
        return
      }

      // Check if selected category is a monthly category (not long_term)
      const selectedCategoryObj = categories.find((c) => c.id === selectedCategory)
      if (!selectedCategoryObj || selectedCategoryObj.exclude_from_budget_total) {
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
          .eq("household_id", user.householdId)
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
  }, [selectedCategory, user, categories])

  const onSubmit = async (data: ExpenseFormValues) => {
    setError("")
    setSuccessMessage("")
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
      const convertedAmount = convertToEUR(data.amount, currency)
      const exchangeRate = getExchangeRate(currency, "EUR")

      // Insert expense
      const { error: insertError } = await supabase.from("expenses").insert({
        logged_by_user_id: user.id,
        household_id: user.householdId,
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
        <GroupedCombobox
          options={getCategoryOptions()}
          value={selectedCategory}
          onValueChange={(value) => setValue("category_id", value)}
          placeholder="Select a category"
          searchPlaceholder="Search categories..."
          emptyMessage="No category found."
        />
        {errors.category_id && (
          <p className="text-sm text-destructive">
            {errors.category_id.message}
          </p>
        )}
        {/* Budget status preview - only show for monthly categories */}
        {selectedCategory && !categories.find((c) => c.id === selectedCategory)?.exclude_from_budget_total && (
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
        <GroupedCombobox
          options={getAccountOptions()}
          value={selectedAccount}
          onValueChange={(value) => setValue("account_id", value)}
          placeholder="Select an account"
          searchPlaceholder="Search accounts..."
          emptyMessage="No account found."
        />
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
