import { redirect } from "next/navigation"
import {
  getServerUser,
  getRecentExpenses,
  getCategories,
  computeTopCategoryIds,
} from "@/lib/server/data"
import { ExpensesPageClient } from "@/components/expenses-page-client"

export default async function ExpensesPage() {
  // Run the user fetch in parallel with the data queries. The data queries
  // rely on RLS (not an explicit household_id filter), so they don't need to
  // wait for getServerUser to resolve. This cuts one full round-trip off the
  // critical path compared to the naive "await user, then fetch data" pattern.
  const [user, expenses, categories] = await Promise.all([
    getServerUser(),
    getRecentExpenses(30),
    getCategories(),
  ])

  if (!user) {
    redirect("/login")
  }

  // Top category ordering is computed from the expenses we just fetched,
  // avoiding a separate RPC round-trip. See computeTopCategoryIds in data.ts.
  const topCategoryIds = computeTopCategoryIds(expenses, categories)

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
