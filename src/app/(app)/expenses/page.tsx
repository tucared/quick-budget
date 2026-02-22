import { redirect } from "next/navigation"
import {
  getServerUser,
  getRecentExpenses,
  getCategories,
  getAccounts,
} from "@/lib/server/data"
import { ExpenseFormWrapper } from "@/components/expense-form-wrapper"
import { ExpenseListClient } from "@/components/expense-list-client"

export default async function ExpensesPage() {
  const user = await getServerUser()

  if (!user) {
    redirect("/login")
  }

  // Fetch all data in parallel
  const [expenses, categories, accounts] = await Promise.all([
    getRecentExpenses(user.householdId, 50),
    getCategories(user.householdId),
    getAccounts(user.householdId),
  ])

  return (
    <main className="container mx-auto px-4 py-6 max-w-2xl">
      {/* Expense Form */}
      <div className="bg-card border rounded-lg p-6 shadow-xs mb-6">
        <h2 className="text-xl font-semibold mb-4">Add Expense</h2>
        <ExpenseFormWrapper />
      </div>

      {/* Divider */}
      <hr className="border-border mb-6" />

      {/* Recent Expenses List */}
      <ExpenseListClient
        initialExpenses={expenses}
        initialCategories={categories}
        initialAccounts={accounts}
        householdId={user.householdId}
      />
    </main>
  )
}
