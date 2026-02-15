import { redirect } from "next/navigation"
import { format, startOfMonth, parseISO } from "date-fns"
import {
  getServerUser,
  getBudgetSummary,
  getMonthlyExpenses,
  getCategories,
  getAccounts,
} from "@/lib/server/data"
import { BudgetPageContent } from "@/components/budget-page-content"

interface BudgetPageProps {
  searchParams: Promise<{ month?: string }>
}

export default async function BudgetPage({ searchParams }: BudgetPageProps) {
  const user = await getServerUser()

  if (!user) {
    redirect("/login")
  }

  const { month } = await searchParams

  // Parse month from searchParams (format: yyyy-MM) or default to current month
  let budgetMonth: string
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    budgetMonth = format(parseISO(`${month}-01`), "yyyy-MM-dd")
  } else {
    budgetMonth = format(startOfMonth(new Date()), "yyyy-MM-dd")
  }

  // Fetch all data in parallel
  const [budgets, expenses, categories, accounts] = await Promise.all([
    getBudgetSummary(user.householdId, budgetMonth),
    getMonthlyExpenses(user.householdId, budgetMonth),
    getCategories(user.householdId),
    getAccounts(user.householdId),
  ])

  return (
    <main className="container mx-auto px-4 py-6 max-w-6xl">
      <BudgetPageContent
        initialBudgets={budgets}
        initialExpenses={expenses}
        categories={categories}
        accounts={accounts}
        householdId={user.householdId}
        budgetMonth={budgetMonth}
      />
    </main>
  )
}
