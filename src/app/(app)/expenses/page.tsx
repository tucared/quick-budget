"use client"

import { useState } from "react"
import { ExpenseForm } from "@/components/expense-form"
import { ExpenseList } from "@/components/expense-list"

export default function ExpensesPage() {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <main className="container mx-auto px-4 py-6 max-w-2xl">
      {/* Expense Form */}
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
  )
}
