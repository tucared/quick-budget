import { cache } from "react"
import { createServerSupabaseClient } from "@/lib/supabase"
import { format, startOfMonth, subDays } from "date-fns"
import { nextMonthString } from "@/lib/date-utils"
import { verifyAccessToken } from "@/lib/server/jwt-verify"
import type {
  BudgetSummary,
  Category,
  Expense,
  ExpenseWithDetails,
  MonthlyBudgetTarget,
  TricountLink,
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
 * Uses getSession() (a cookie read, no network call) then verifies the
 * access token signature locally via JWKS (no /auth/v1/user round-trip).
 * Claims are pulled from the verified payload — household_id is populated
 * by the private.custom_access_token_hook auth hook (see supabase/schemas/
 * 02_tables.sql and config.toml / Supabase dashboard for enablement).
 *
 * Returns null on missing session, invalid/expired token, or absent
 * household_id claim. Callers redirect to /login on null.
 */
export const getServerUser = cache(async (): Promise<UserData | null> => {
  const supabase = await getSupabase()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const verdict = await verifyAccessToken(session?.access_token)
  if (!verdict.ok) return null

  const { claims } = verdict
  const householdId = claims.app_metadata?.household_id
  if (!householdId) return null

  return {
    id: claims.sub,
    email: claims.email,
    fullName: claims.user_metadata?.full_name || claims.email?.split("@")[0] || "User",
    householdId,
  }
})

/**
 * Server-side function to fetch budgets and allowances for a given month
 * in a single query. Rows are partitioned in JS by `exclude_from_budget_total`
 * so the budget_summary view is hit once per page load instead of twice.
 * RLS filters by the caller's household — no explicit household_id needed.
 */
export async function getBudgetAndAllowanceSummary(
  budgetMonth?: string
): Promise<{ budgets: BudgetSummary[]; allowances: BudgetSummary[] }> {
  const supabase = await getSupabase()
  const month = budgetMonth || format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const { data, error } = await supabase
    .from("budget_summary")
    .select("*")
    .eq("budget_month", month)
    .order("category_name", { ascending: true })

  if (error) {
    console.error("Failed to fetch budget summary:", error)
    return { budgets: [], allowances: [] }
  }

  const budgets: BudgetSummary[] = []
  const allowances: BudgetSummary[] = []
  for (const row of data ?? []) {
    if (row.exclude_from_budget_total) allowances.push(row)
    else budgets.push(row)
  }
  return { budgets, allowances }
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
 * Server-side function to fetch the household's linked tricount (if any).
 * Returns null when no Tricount has been connected.
 * RLS filters by the caller's household — no explicit household_id needed.
 */
export async function getTricountLink(): Promise<TricountLink | null> {
  const supabase = await getSupabase()

  const { data, error } = await supabase
    .from("tricount_links")
    .select("*")
    .maybeSingle()

  if (error) {
    console.error("Failed to fetch tricount link:", error)
    return null
  }

  return data
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
