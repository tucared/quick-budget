// Database entity types derived from Supabase generated types
// This ensures the application types stay in sync with the database schema

import type { Database } from './database.types'

// Helper type to extract table rows from the generated Database type
type Tables = Database['public']['Tables']
type Views = Database['public']['Views']

// Base entity types derived from generated database schema
export type User = Tables['users']['Row']
export type Category = Tables['categories']['Row']
export type Expense = Tables['expenses']['Row']
export type BudgetAllocation = Tables['budget_allocations']['Row']
export type BudgetSummary = Views['budget_summary']['Row']

// Authenticated user data used across client and server
export interface UserData {
  id: string
  email: string | undefined
  fullName: string
  householdId: string
}

// Extended types with relations for displaying data
export interface ExpenseWithDetails extends Expense {
  category?: Category
}

// Local storage keys for remembering defaults, namespaced by household
export function getStorageKeys(householdId: string) {
  const prefix = `qb:${householdId}`
  return {
    LAST_CATEGORY: `${prefix}:last_category`,
    LAST_CURRENCY: `${prefix}:last_currency`,
    CATEGORY_USAGE: `${prefix}:category_usage`,
  } as const
}

/** Clear all quick-budget localStorage entries (call on logout) */
export function clearStorageKeys() {
  try {
    const keys = Object.keys(localStorage)
    for (const key of keys) {
      if (key.startsWith("qb:")) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // localStorage might be disabled
  }
}
