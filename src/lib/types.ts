// Database entity types matching the Supabase schema

export interface User {
  id: string
  email: string
  full_name: string | null
  household_id: string
  created_at: string
  updated_at: string
}

export interface Household {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  household_id: string
  name: string
  exclude_from_budget_total: boolean
  icon: string | null
  color: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AccountType = "credit_card" | "debit_card" | "bank_account" | "cash" | "other"

export interface Account {
  id: string
  household_id: string
  owner_user_id: string
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
  logged_by_user_id: string
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

export interface BudgetAllocation {
  id: string
  household_id: string
  category_id: string
  budget_month: string // Date in YYYY-MM-DD format (first day of month)
  allocated_amount: number
  currency: string
  created_at: string
  updated_at: string
}

export interface BudgetSummary {
  id: string
  household_id: string
  budget_month: string
  category_id: string
  category_name: string
  category_icon: string | null
  category_color: string | null
  exclude_from_budget_total: boolean
  allocated_amount: number
  currency: string
  spent_amount: number
  remaining_amount: number
  percent_spent: number
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
  CATEGORY_USAGE: "quick_budget_category_usage",
  ACCOUNT_USAGE: "quick_budget_account_usage",
} as const
