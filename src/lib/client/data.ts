import type { SupabaseClient } from "@supabase/supabase-js"
import { nextMonthString } from "@/lib/date-utils"
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

export async function fetchBudgetSummary(
  supabase: SupabaseClient,
  householdId: string,
  budgetMonth: string
): Promise<{ data: BudgetSummary[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from("budget_summary")
    .select("*")
    .eq("household_id", householdId)
    .eq("budget_month", budgetMonth)
    .eq("exclude_from_budget_total", false)
    .order("category_name", { ascending: true })

  return { data, error }
}

export async function fetchAllowanceSummary(
  supabase: SupabaseClient,
  householdId: string,
  budgetMonth: string
): Promise<{ data: BudgetSummary[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from("budget_summary")
    .select("*")
    .eq("household_id", householdId)
    .eq("budget_month", budgetMonth)
    .eq("exclude_from_budget_total", true)
    .order("category_name", { ascending: true })

  return { data, error }
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
