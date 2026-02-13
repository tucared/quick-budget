import { redirect } from "next/navigation"
import { format, startOfMonth } from "date-fns"
import {
  getServerUser,
  getBudgetSummary,
  getMonthlyExpenses,
} from "@/lib/server/data"
import { BudgetPageContent } from "@/components/budget-page-content"

export default async function BudgetPage() {
  const user = await getServerUser()

  if (!user) {
    redirect("/login")
  }

  const budgetMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd')

  // Fetch all data in parallel
  const [budgets, expenses] = await Promise.all([
    getBudgetSummary(user.householdId),
    getMonthlyExpenses(user.householdId, budgetMonth),
  ])

  return (
    <main className="container mx-auto px-4 py-6 max-w-6xl">
      <BudgetPageContent
        initialBudgets={budgets}
        initialExpenses={expenses}
        householdId={user.householdId}
        budgetMonth={budgetMonth}
      />
    </main>
  )
}
