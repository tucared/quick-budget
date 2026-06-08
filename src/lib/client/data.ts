import type { SupabaseClient } from "@supabase/supabase-js"
import { nextMonthString } from "@/lib/date-utils"
import { partitionBudgetSummary, tricountCashflowAdjustmentEuros } from "@/lib/budget-utils"
import type {
  BudgetSummary,
  Expense,
  MonthlyBudgetTarget,
} from "@/lib/types"

// Client-side counterparts to src/lib/server/data.ts. The two files MUST stay
// in sync — server components fetch initial data via the server file, then
// client components re-fetch the same shapes here on realtime / mutation
// success. Server functions rely solely on RLS; client callers pass an
// explicit householdId for clarity (also enforced by RLS on the database
// side).

export async function fetchBudgetAndAllowanceSummary(
  supabase: SupabaseClient,
  householdId: string,
  budgetMonth: string
): Promise<{
  data: { budgets: BudgetSummary[]; allowances: BudgetSummary[] } | null
  error: unknown
}> {
  const { data, error } = await supabase
    .from("budget_summary")
    .select("*")
    .eq("household_id", householdId)
    .eq("budget_month", budgetMonth)
    .order("category_name", { ascending: true })

  if (error || !data) {
    return { data: null, error }
  }

  return { data: partitionBudgetSummary(data), error: null }
}

export async function fetchMonthlyBudgetTarget(
  supabase: SupabaseClient,
  householdId: string,
  budgetMonth: string
): Promise<{ data: MonthlyBudgetTarget | null; error: unknown }> {
  const { data, error } = await supabase
    .from("monthly_budget_targets")
    .select("*")
    .eq("household_id", householdId)
    .eq("budget_month", budgetMonth)
    .maybeSingle()

  return { data, error }
}

export async function fetchMonthlyExpenses(
  supabase: SupabaseClient,
  householdId: string,
  budgetMonth: string
): Promise<{ data: Expense[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("household_id", householdId)
    .gte("expense_date", budgetMonth)
    .lt("expense_date", nextMonthString(budgetMonth))
    .order("expense_date", { ascending: true })

  return { data, error }
}

/**
 * EUR adjustment from budget "spent" to actual cash flow for a month: per
 * reconciled entry, `paid − share` for mirrored expenses and `paid` for income.
 * Mirrors `getTricountCashflowAdjustment` in server/data.ts; kept live after the
 * on-load auto-sync. Returns null (no entries) so the figure can be hidden.
 */
export async function fetchTricountCashflowAdjustment(
  supabase: SupabaseClient,
  householdId: string,
  budgetMonth: string
): Promise<{ data: number | null; error: unknown }> {
  const { data, error } = await supabase
    .from("tricount_entry_map")
    .select("paid_converted_amount, share_converted_amount, expense_id")
    .eq("household_id", householdId)
    .gte("entry_date", budgetMonth)
    .lt("entry_date", nextMonthString(budgetMonth))

  if (error || !data || data.length === 0) {
    return { data: null, error }
  }

  return { data: tricountCashflowAdjustmentEuros(data), error: null }
}
