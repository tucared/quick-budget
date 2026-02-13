import { redirect } from "next/navigation"
import {
  getServerUser,
  getBudgetSummary,
  getMonthlyExpenses,
} from "@/lib/server/data"
import { BudgetPageContent } from "@/components/budget-page-content"
import { getCurrentBudgetMonth } from "@/lib/date-utils"

export default async function BudgetPage() {
  const user = await getServerUser()

  if (!user) {
    redirect("/login")
  }

  const budgetMonth = getCurrentBudgetMonth()

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
