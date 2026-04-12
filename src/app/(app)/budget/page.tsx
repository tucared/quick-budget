import { redirect } from "next/navigation"
import { format, startOfMonth, parseISO } from "date-fns"
import {
  getServerUser,
  getBudgetSummary,
  getAllowanceSummary,
  getMonthlyBudgetTarget,
  getMonthlyExpenses,
  getCategories,
} from "@/lib/server/data"
import { BudgetPageContent } from "@/components/budget-page-content"

interface BudgetPageProps {
  searchParams: Promise<{ month?: string }>
}

export default async function BudgetPage({ searchParams }: BudgetPageProps) {
  const { month } = await searchParams

  // Parse month from searchParams (format: yyyy-MM) or default to current month
  let budgetMonth: string
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    budgetMonth = format(parseISO(`${month}-01`), "yyyy-MM-dd")
  } else {
    budgetMonth = format(startOfMonth(new Date()), "yyyy-MM-dd")
  }

  // Run the user fetch in parallel with the data queries. The data queries
  // rely on RLS (not an explicit household_id filter), so they don't need to
  // wait for getServerUser to resolve. This cuts one full round-trip off the
  // critical path.
  const [user, budgets, allowances, target, expenses, categories] = await Promise.all([
    getServerUser(),
    getBudgetSummary(budgetMonth),
    getAllowanceSummary(budgetMonth),
    getMonthlyBudgetTarget(budgetMonth),
    getMonthlyExpenses(budgetMonth),
    getCategories(),
  ])

  if (!user) {
    redirect("/login")
  }

  return (
    <main className="container mx-auto px-4 py-6 max-w-6xl">
      <BudgetPageContent
        initialBudgets={budgets}
        initialAllowances={allowances}
        initialTarget={target}
        initialExpenses={expenses}
        categories={categories}
        householdId={user.householdId}
        budgetMonth={budgetMonth}
      />
    </main>
  )
}
