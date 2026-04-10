import { redirect } from "next/navigation"
import {
  getServerUser,
  getRecentExpenses,
  getCategories,
  getTopCategoryIds,
} from "@/lib/server/data"
import { ExpensesPageClient } from "@/components/expenses-page-client"

export default async function ExpensesPage() {
  const user = await getServerUser()

  if (!user) {
    redirect("/login")
  }

  // Fetch all data in parallel
  const [expenses, categories, topCategoryIds] = await Promise.all([
    getRecentExpenses(user.householdId, 50),
    getCategories(user.householdId),
    getTopCategoryIds(user.householdId),
  ])

  return (
    <main className="container mx-auto px-4 py-6 max-w-2xl">
      <ExpensesPageClient
        initialExpenses={expenses}
        initialCategories={categories}
        initialTopCategoryIds={topCategoryIds}
      />
    </main>
  )
}
