"use client"

import { useEffect, useRef } from "react"
import { useUser } from "./use-user"
import { RealtimeSubscriptionManager } from "./realtime-subscription-manager"

// Expense change event types
export type ExpenseChangeEvent = {
  type: "INSERT" | "UPDATE" | "DELETE"
  new?: unknown
  old?: unknown
}

// Callback type for expense changes
export type ExpenseChangeCallback = (event: ExpenseChangeEvent) => void

// Singleton instance
const subscriptionManager = new RealtimeSubscriptionManager<ExpenseChangeCallback>({
  table: "expenses",
  channelPrefix: "expenses_household",
  buildCallbackArgs: (payload) => [{
    type: payload.eventType as "INSERT" | "UPDATE" | "DELETE",
    new: payload.new,
    old: payload.old,
  }],
})

/**
 * Hook to subscribe to real-time expense changes for the current user's household.
 * Uses a household-scoped subscription that's created when the first component subscribes
 * and cleaned up when the last component unsubscribes.
 *
 * @param callback - Function to call when an expense changes (insert/update/delete)
 * @param enabled - Whether to enable the subscription (default: true)
 *
 * @example
 * useExpenseSubscription((event) => {
 *   if (event.type === "INSERT") {
 *     console.log("New expense:", event.new)
 *   }
 * })
 */
export function useExpenseSubscription(
  callback: ExpenseChangeCallback,
  enabled = true
) {
  const { user, loading } = useUser()
  const callbackRef = useRef(callback)

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    // Don't subscribe if disabled, still loading, or no user
    if (!enabled || loading || !user?.householdId) return

    // Subscribe with a stable wrapper that uses the ref
    const unsubscribe = subscriptionManager.subscribe(
      user.householdId,
      ((event: ExpenseChangeEvent) => {
        callbackRef.current(event)
      }) as ExpenseChangeCallback
    )

    return unsubscribe
  }, [enabled, loading, user?.householdId])
}
