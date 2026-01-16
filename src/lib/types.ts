// Database entity types matching the Supabase schema

export interface User {
  id: string
  email: string
  full_name: string | null
  created_at: string
  updated_at: string
}

export type CategoryType = "monthly" | "long_term"

export interface Category {
  id: string
  name: string
  category_type: CategoryType
  icon: string | null
  color: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AccountType = "credit_card" | "debit_card" | "bank_account" | "cash" | "other"

export interface Account {
  id: string
  user_id: string
  name: string
  account_type: AccountType
  currency: string
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Expense {
  id: string
  user_id: string
  category_id: string | null
  account_id: string | null
  amount: number
  currency: string
  converted_amount: number
  converted_currency: string
  exchange_rate: number
  expense_date: string // Date in YYYY-MM-DD format
  description: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// Form types for creating/updating expenses
export interface ExpenseFormData {
  amount: number
  category_id: string
  account_id: string
  expense_date: string
  description?: string
  currency?: string
}

// Extended types with relations for displaying data
export interface ExpenseWithDetails extends Expense {
  category?: Category
  account?: Account
}

// Local storage keys for remembering defaults
export const STORAGE_KEYS = {
  LAST_CATEGORY: "quick_budget_last_category",
  LAST_ACCOUNT: "quick_budget_last_account",
  LAST_CURRENCY: "quick_budget_last_currency",
} as const
