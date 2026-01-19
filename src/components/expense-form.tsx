"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { format } from "date-fns"
import { createClient } from "@/lib/supabase"
import { expenseSchema, type ExpenseFormValues } from "@/lib/validations"
import { STORAGE_KEYS, type Category, type Account } from "@/lib/types"
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

interface ExpenseFormProps {
  onSuccess?: () => void
}

export function ExpenseForm({ onSuccess }: ExpenseFormProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

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
      expense_date: format(new Date(), "yyyy-MM-dd"),
      currency: "USD",
    },
  })

  const selectedCategory = watch("category_id")
  const selectedAccount = watch("account_id")

  // Load categories and accounts on mount
  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()

      // Load categories
      const { data: categoriesData } = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("name")

      if (categoriesData) {
        setCategories(categoriesData)
      }

      // Load accounts
      const { data: accountsData } = await supabase
        .from("accounts")
        .select("*")
        .eq("is_active", true)
        .order("name")

      if (accountsData) {
        setAccounts(accountsData)
      }

      // Load smart defaults from localStorage
      const lastCategory = localStorage.getItem(STORAGE_KEYS.LAST_CATEGORY)
      const lastAccount = localStorage.getItem(STORAGE_KEYS.LAST_ACCOUNT)

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
    }

    loadData()
  }, [setValue])

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

      if (userError || !userData?.household_id) {
        setError("Could not find your household. Please contact support.")
        setLoading(false)
        return
      }

      // Insert expense
      const { error: insertError } = await supabase.from("expenses").insert({
        logged_by_user_id: user.id,
        household_id: userData.household_id,
        category_id: data.category_id,
        account_id: data.account_id,
        amount: data.amount,
        currency: data.currency || "USD",
        converted_amount: data.amount, // For MVP, no conversion
        converted_currency: data.currency || "USD",
        exchange_rate: 1.0,
        expense_date: data.expense_date,
        description: data.description || null,
      })

      if (insertError) {
        setError(insertError.message)
        setLoading(false)
        return
      }

      // Save defaults to localStorage
      localStorage.setItem(STORAGE_KEYS.LAST_CATEGORY, data.category_id)
      localStorage.setItem(STORAGE_KEYS.LAST_ACCOUNT, data.account_id)
      if (data.currency) {
        localStorage.setItem(STORAGE_KEYS.LAST_CURRENCY, data.currency)
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
      setError("An unexpected error occurred")
      setLoading(false)
    }
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

      {/* Amount */}
      <div className="space-y-2">
        <Label htmlFor="amount">Amount *</Label>
        <Input
          id="amount"
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          inputMode="decimal"
          autoFocus
          {...register("amount", { valueAsNumber: true })}
        />
        {errors.amount && (
          <p className="text-sm text-destructive">{errors.amount.message}</p>
        )}
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label htmlFor="category">Category *</Label>
        <Select
          value={selectedCategory}
          onValueChange={(value) => setValue("category_id", value)}
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
        {errors.category_id && (
          <p className="text-sm text-destructive">
            {errors.category_id.message}
          </p>
        )}
      </div>

      {/* Account */}
      <div className="space-y-2">
        <Label htmlFor="account">Account *</Label>
        <Select
          value={selectedAccount}
          onValueChange={(value) => setValue("account_id", value)}
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
