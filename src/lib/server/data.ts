import { cache } from "react"
import { createServerSupabaseClient } from "@/lib/supabase"
import { format, startOfMonth, subDays } from "date-fns"
import { nextMonthString } from "@/lib/date-utils"
import { decodeJwtClaim } from "@/lib/jwt-claim"
import type {
  BudgetSummary,
  Category,
  Expense,
  ExpenseWithDetails,
  MonthlyBudgetTarget,
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
 * Uses getSession() (a cookie read, no network call) and decodes
 * household_id from the access token JWT, where it's populated by the
 * private.custom_access_token_hook auth hook. The hook is configured in
 * supabase/config.toml for local dev and is enabled in the Supabase
 * dashboard for both Dev and Prod (Authentication → Hooks → Customize
 * Access Token → private.custom_access_token_hook).
 *
 * The claim has to be read from the encoded JWT directly, not from
 * `session.user.app_metadata` — supabase-js populates that field from
 * the auth.users row, not the JWT payload.
 *
 * Returns null when the claim is missing (the legacy public.users
 * fallback was dropped in
 * supabase/migrations/20260514163400_drop_users_fallback_from_get_my_household_id.sql).
 * Callers redirect to /login on null; tokens missing the claim refresh
 * on the next /token POST and pick it up.
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

  const claimHouseholdId = decodeJwtClaim(session?.access_token, [
    "app_metadata",
    "household_id",
  ])

  if (!claimHouseholdId) {
    return null
  }

  return {
    id: authUser.id,
    email: authUser.email,
    fullName: authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "User",
    householdId: claimHouseholdId,
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
 * Server-side function to fetch the monthly budget target for a given month.
 * Returns null when no target has been set for the month.
 * RLS filters by the caller's household — no explicit household_id needed.
 */
export async function getMonthlyBudgetTarget(
  budgetMonth?: string
): Promise<MonthlyBudgetTarget | null> {
  const supabase = await getSupabase()
  const month = budgetMonth || format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const { data, error } = await supabase
    .from("monthly_budget_targets")
    .select("*")
    .eq("budget_month", month)
    .maybeSingle()

  if (error) {
    console.error("Failed to fetch monthly budget target:", error)
    return null
  }

  return data
}

/**
 * Server-side function to fetch expenses for a given month.
 * RLS filters by the caller's household — no explicit household_id needed.
 */
export async function getMonthlyExpenses(
  budgetMonth: string
): Promise<Expense[]> {
  const supabase = await getSupabase()

  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .gte("expense_date", budgetMonth)
    .lt("expense_date", nextMonthString(budgetMonth))
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
 * Combined fetch: expenses + active categories in a single RPC round trip.
 * Replaces the two parallel page-load queries on /expenses and /budget.
 *
 * Mode 'recent' returns the top N expenses ordered by date desc (for
 * /expenses); 'monthly' returns all expenses within the given month
 * ordered by date asc (for /budget).
 */
type ExpensesAndCategoriesRecent = { mode: "recent"; limit?: number }
type ExpensesAndCategoriesMonthly = { mode: "monthly"; month: string }
type ExpensesAndCategoriesArgs =
  | ExpensesAndCategoriesRecent
  | ExpensesAndCategoriesMonthly

export async function getExpensesAndCategories(
  args: ExpensesAndCategoriesArgs
): Promise<{ expenses: ExpenseWithDetails[]; categories: Category[] }> {
  const supabase = await getSupabase()

  const params =
    args.mode === "recent"
      ? { p_mode: "recent", p_limit: args.limit ?? 30, p_month: null }
      : { p_mode: "monthly", p_limit: 30, p_month: args.month }

  const { data, error } = await supabase.rpc(
    "get_expenses_and_categories",
    params
  )

  if (error) {
    console.error("Failed to fetch expenses and categories:", error)
    return { expenses: [], categories: [] }
  }

  const payload = (data ?? {}) as {
    expenses?: Expense[]
    categories?: Category[]
  }

  return {
    expenses: (payload.expenses ?? []) as ExpenseWithDetails[],
    categories: payload.categories ?? [],
  }
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
 * Counts active categories used within the last 30 days, ordered by
 * frequency. Runs in TypeScript on already-fetched data — no extra DB
 * round-trip.
 *
 * Note: if the caller passes fewer than 30 days' worth of expenses, the
 * result is based on whatever window those expenses cover.
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
