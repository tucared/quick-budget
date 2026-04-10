import { cache } from "react"
import { createServerSupabaseClient } from "@/lib/supabase"
import { format, parseISO, startOfMonth, subDays } from "date-fns"
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
 *
 * This function is intentionally designed to run in parallel (via Promise.all)
 * with the data-fetching functions below, which rely on RLS rather than an
 * explicit household_id filter. See expenses/page.tsx and budget/page.tsx for
 * the pattern.
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
 * Server-side function to fetch budget summary for a given month.
 * RLS filters by the caller's household — no explicit household_id needed.
 */
export async function getBudgetSummary(
  budgetMonth?: string
): Promise<BudgetSummary[]> {
  const supabase = await getSupabase()
  const month = budgetMonth || format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const { data, error } = await supabase
    .from("budget_summary")
    .select("*")
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
 * (categories with exclude_from_budget_total = true).
 * RLS filters by the caller's household — no explicit household_id needed.
 */
export async function getAllowanceSummary(
  budgetMonth?: string
): Promise<BudgetSummary[]> {
  const supabase = await getSupabase()
  const month = budgetMonth || format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const { data, error } = await supabase
    .from("budget_summary")
    .select("*")
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
 * Server-side function to fetch expenses for a given month.
 * RLS filters by the caller's household — no explicit household_id needed.
 */
export async function getMonthlyExpenses(
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
 * Server-side function to fetch recent expenses.
 * RLS filters by the caller's household — no explicit household_id needed.
 */
export async function getRecentExpenses(
  limit: number = 20
): Promise<ExpenseWithDetails[]> {
  const supabase = await getSupabase()

  const { data, error } = await supabase
    .from("expenses")
    .select("*")
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
 * Server-side function to fetch active categories.
 * RLS filters by the caller's household — no explicit household_id needed.
 */
export async function getCategories(): Promise<Category[]> {
  const supabase = await getSupabase()

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("is_active", true)

  if (error) {
    console.error("Failed to fetch categories:", error)
    return []
  }

  return data || []
}

/**
 * Compute the most-used category IDs from a set of recent expenses.
 * Matches the semantics of the top_categories_by_usage RPC (active categories,
 * last 30 days) but runs in TypeScript on data we've already fetched — no extra
 * database round-trip.
 *
 * Note: if the caller passes fewer than 30 days' worth of expenses, the result
 * is based on whatever window those expenses cover. For the expenses page,
 * getRecentExpenses(50) typically spans well over 30 days in a 2-person
 * household, so the result matches the RPC in practice.
 */
export function computeTopCategoryIds(
  expenses: ExpenseWithDetails[],
  activeCategories: Category[],
  limit = 7
): string[] {
  const activeIds = new Set(activeCategories.map((c) => c.id))
  const cutoff = format(subDays(new Date(), 30), "yyyy-MM-dd")

  const counts = new Map<string, number>()
  for (const e of expenses) {
    if (!e.category_id) continue
    if (!activeIds.has(e.category_id)) continue
    if (e.expense_date < cutoff) continue
    counts.set(e.category_id, (counts.get(e.category_id) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id)
}
