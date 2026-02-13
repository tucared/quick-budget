"use client"

import { useRouter } from "next/navigation"
import { ExpenseForm } from "./expense-form"

/**
 * Client wrapper for ExpenseForm that triggers server-side refresh
 * This ensures the expense list updates even if real-time subscriptions aren't working
 */
export function ExpenseFormWrapper() {
  const router = useRouter()

  const handleSuccess = () => {
    // Trigger server-side refresh to refetch expense data
    router.refresh()
  }

  return <ExpenseForm onSuccess={handleSuccess} />
}
