"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { useUser } from "@/lib/hooks/use-user"
import { ExpenseForm } from "@/components/expense-form"
import { ExpenseList } from "@/components/expense-list"
import { Button } from "@/components/ui/button"

export default function ExpensesPage() {
  const router = useRouter()
  const { user } = useUser()
  const [refreshKey, setRefreshKey] = useState(0)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Quick Budget</h1>
            {user && (
              <p className="text-sm text-muted-foreground">
                Welcome, {user.fullName}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="default" disabled>
              Expenses
            </Button>
            <Button variant="outline" onClick={() => router.push("/budget")}>
              Budget
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              Log Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 max-w-2xl">
        {/* Expense Form - Sticky at top */}
        <div className="mb-8 bg-background">
          <div className="bg-card border rounded-lg p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Add Expense</h2>
            <ExpenseForm onSuccess={() => setRefreshKey((prev) => prev + 1)} />
          </div>
        </div>

        {/* Recent Expenses List */}
        <div key={refreshKey}>
          <ExpenseList />
        </div>
      </main>
    </div>
  )
}
