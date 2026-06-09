import { cache } from "react"
import { createServerSupabaseClient } from "@/lib/supabase"
import { format, startOfMonth, subDays } from "date-fns"
import { nextMonthString } from "@/lib/date-utils"
import { partitionBudgetSummary, tricountCashflowAdjustmentEuros } from "@/lib/budget-utils"
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

  return partitionBudgetSummary(data ?? [])
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
 * Server-side function to fetch the household's linked tricounts.
 * RLS filters by the caller's household — no explicit household_id needed.
 */
export async function getTricountLinks(): Promise<TricountLink[]> {
  const supabase = await getSupabase()

  const { data, error } = await supabase
    .from("tricount_links")
    .select("*")
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Failed to fetch tricount links:", error)
    return []
  }

  return data ?? []
}

/**
 * Server-side function to fetch the household's members (for member mapping).
 * RLS filters by the caller's household — no explicit household_id needed.
 */
export async function getHouseholdUsers(): Promise<
  { id: string; full_name: string | null; email: string }[]
> {
  const supabase = await getSupabase()

  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, email")

  if (error) {
    console.error("Failed to fetch household users:", error)
    return []
  }

  return data ?? []
}

/**
 * Server-side map of synced expense id → the tricount title it was imported
 * from, so the expense list can tag each mirrored row with its tricount name
 * and render it read-only. Covers all of the household's links (one fetch).
 * RLS filters by the caller's household — no explicit household_id needed.
 */
export async function getSyncedExpenseTitles(): Promise<Record<string, string>> {
  const supabase = await getSupabase()

  const [{ data: maps, error: mapErr }, { data: links, error: linkErr }] = await Promise.all([
    supabase.from("tricount_entry_map").select("expense_id, link_id"),
    supabase.from("tricount_links").select("id, title"),
  ])

  if (mapErr || linkErr) {
    console.error("Failed to fetch synced expense titles:", mapErr ?? linkErr)
    return {}
  }

  const titleByLink = new Map<string, string>()
  for (const l of links ?? []) titleByLink.set(l.id, l.title || "Tricount")

  const result: Record<string, string> = {}
  for (const m of maps ?? []) {
    // Income rows carry no expense_id (reconciled, not mirrored as spend).
    if (!m.expense_id) continue
    result[m.expense_id] = titleByLink.get(m.link_id) ?? "Tricount"
  }
  return result
}

/**
 * EUR adjustment that turns the budget's share-based "spent" into the month's
 * actual cash flow (what really left the household wallet). The budget total
 * counts each mirrored Tricount entry at the household's *share* (consumption);
 * actual cash is what the household *paid*. So per reconciled entry we add
 * `paid − share` for mirrored expenses (swap consumption for cash) and `paid`
 * for INCOME (cash received, never in the budget total). Adding this to the
 * displayed `totalSpent` yields the real cash out. Returns null when the
 * household has no reconciled entries that month (so the figure can be hidden).
 * RLS scopes to the caller's household.
 */
export async function getTricountCashflowAdjustment(
  budgetMonth?: string
): Promise<number | null> {
  const supabase = await getSupabase()
  const month = budgetMonth || format(startOfMonth(new Date()), "yyyy-MM-dd")

  const { data, error } = await supabase
    .from("tricount_entry_map")
    .select("paid_converted_amount, share_converted_amount, expense_id")
    .gte("entry_date", month)
    .lt("entry_date", nextMonthString(month))

  if (error) {
    console.error("Failed to fetch tricount cashflow adjustment:", error)
    return null
  }
  return tricountCashflowAdjustmentEuros(data ?? [])
}

/** Per-link signed owe/owed totals (paid & consumed, EUR) for the Sync tab. */
export interface TricountLinkBalance {
  paid: number
  share: number
}

/**
 * Per-link owe/owed totals across all months, in EUR: for each link, the signed
 * sums of `paid_converted_amount` and `share_converted_amount` over its
 * reconciled entries (NORMAL + INCOME). The Sync tab renders the full breakdown
 * (you paid / your share / net). RLS scopes to the caller's household.
 */
export async function getTricountLinkBalances(): Promise<Record<string, TricountLinkBalance>> {
  const supabase = await getSupabase()

  const { data, error } = await supabase
    .from("tricount_entry_map")
    .select("link_id, paid_converted_amount, share_converted_amount")

  if (error) {
    console.error("Failed to fetch tricount link balances:", error)
    return {}
  }

  // Accumulate in integer cents to avoid float drift, then convert back.
  const cents = new Map<string, { paid: number; share: number }>()
  for (const r of data ?? []) {
    const acc = cents.get(r.link_id) ?? { paid: 0, share: 0 }
    acc.paid += Math.round(Number(r.paid_converted_amount) * 100)
    acc.share += Math.round(Number(r.share_converted_amount) * 100)
    cents.set(r.link_id, acc)
  }

  const result: Record<string, TricountLinkBalance> = {}
  for (const [linkId, acc] of cents) {
    result[linkId] = { paid: acc.paid / 100, share: acc.share / 100 }
  }
  return result
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
