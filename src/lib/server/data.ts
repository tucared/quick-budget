import { createServerSupabaseClient } from "@/lib/supabase"
import { format, parseISO, startOfMonth } from "date-fns"
import type {
  BudgetSummary,
  Category,
  Expense,
  ExpenseWithDetails,
  UserData,
} from "@/lib/types"

/**
 * Server-side function to get authenticated user and their household
 * Must be called from Server Components or Server Actions
 */
export async function getServerUser(): Promise<UserData | null> {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    return null
  }

  const { data: userData } = await supabase
    .from("users")
    .select("full_name, household_id")
    .eq("id", authUser.id)
    .single()

  if (!userData?.household_id) {
    return null
  }

  return {
    id: authUser.id,
    email: authUser.email,
    fullName: userData.full_name || authUser.email?.split("@")[0] || "User",
    householdId: userData.household_id,
  }
}

/**
 * Server-side function to fetch budget summary for a given month
 */
export async function getBudgetSummary(
  householdId: string,
  budgetMonth?: string
): Promise<BudgetSummary[]> {
  const supabase = await createServerSupabaseClient()
  const month = budgetMonth || format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const { data, error } = await supabase
    .from("budget_summary")
    .select("*")
    .eq("household_id", householdId)
    .eq("budget_month", month)
    .eq("exclude_from_budget_total", false)
    .order("category_name", { ascending: true })

  if (error) {
    console.error("Failed to fetch budget summary:", error)
    return []
  }

  return data || []
}

/**
 * Server-side function to fetch allowance summary for a given month
 * (categories with exclude_from_budget_total = true)
 */
export async function getAllowanceSummary(
  householdId: string,
  budgetMonth?: string
): Promise<BudgetSummary[]> {
  const supabase = await createServerSupabaseClient()
  const month = budgetMonth || format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const { data, error } = await supabase
    .from("budget_summary")
    .select("*")
    .eq("household_id", householdId)
    .eq("budget_month", month)
    .eq("exclude_from_budget_total", true)
    .order("category_name", { ascending: true })

  if (error) {
    console.error("Failed to fetch allowance summary:", error)
    return []
  }

  return data || []
}

/**
 * Server-side function to fetch expenses for current month
 */
export async function getMonthlyExpenses(
  householdId: string,
  budgetMonth: string
): Promise<Expense[]> {
  const supabase = await createServerSupabaseClient()

  // Calculate next month for range query
  const currentDate = parseISO(budgetMonth)
  const nextMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    1
  )
  const nextMonthStr = format(nextMonth, "yyyy-MM-dd")

  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("household_id", householdId)
    .gte("expense_date", budgetMonth)
    .lt("expense_date", nextMonthStr)
    .order("expense_date", { ascending: true })

  if (error) {
    console.error("Failed to fetch monthly expenses:", error)
    return []
  }

  return (data || []) as Expense[]
}

/**
 * Server-side function to fetch recent expenses
 */
export async function getRecentExpenses(
  householdId: string,
  limit: number = 20
): Promise<ExpenseWithDetails[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("household_id", householdId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("Failed to fetch recent expenses:", error)
    return []
  }

  return data || []
}

/**
 * Server-side function to fetch categories for a household
 */
export async function getCategories(householdId: string): Promise<Category[]> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("household_id", householdId)
    .eq("is_active", true)

  if (error) {
    console.error("Failed to fetch categories:", error)
    return []
  }

  return data || []
}

