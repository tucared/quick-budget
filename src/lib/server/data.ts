import { cache } from "react"
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
 * Request-scoped cached Supabase client.
 * React.cache ensures one client per server request, avoiding redundant
 * cookie reads and client instantiation across layout + page + data functions.
 */
const getSupabase = cache(() => createServerSupabaseClient())

/**
 * Server-side function to get authenticated user and their household.
 * Cached per request — safe to call from both layout and page without
 * triggering duplicate auth round-trips.
 *
 * Uses getSession() instead of getUser() because middleware already validates
 * the JWT server-side via getUser() on every request. Reading the session from
 * cookies here avoids a redundant network roundtrip to Supabase Auth.
 */
export const getServerUser = cache(async (): Promise<UserData | null> => {
  const supabase = await getSupabase()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const authUser = session?.user
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
})

/**
 * Server-side function to fetch budget summary for a given month
 */
export async function getBudgetSummary(
  householdId: string,
  budgetMonth?: string
): Promise<BudgetSummary[]> {
  const supabase = await getSupabase()
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
  const supabase = await getSupabase()
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
  const supabase = await getSupabase()

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
  const supabase = await getSupabase()

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
  const supabase = await getSupabase()

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

/**
 * Server-side function to fetch the most-used category IDs for a household.
 * Returns an ordered list of category IDs ranked by recent usage.
 */
export async function getTopCategoryIds(
  householdId: string,
  limit = 7
): Promise<string[]> {
  const supabase = await getSupabase()

  const { data } = await supabase.rpc("top_categories_by_usage", {
    p_household_id: householdId,
    p_limit: limit,
  })

  return (data ?? []).map((r: { category_id: string }) => r.category_id)
}

