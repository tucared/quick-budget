import { redirect } from "next/navigation"
import {
  getServerUser,
  getRecentExpenses,
  getCategories,
} from "@/lib/server/data"
import { ExpensesPageClient } from "@/components/expenses-page-client"

export default async function ExpensesPage() {
  const user = await getServerUser()

  if (!user) {
    redirect("/login")
  }

  // Fetch all data in parallel
  const [expenses, categories] = await Promise.all([
    getRecentExpenses(user.householdId, 50),
    getCategories(user.householdId),
  ])

  return (
    <main className="container mx-auto px-4 py-6 max-w-2xl">
      <ExpensesPageClient
        initialExpenses={expenses}
        initialCategories={categories}
        householdId={user.householdId}
      />
    </main>
  )
}
