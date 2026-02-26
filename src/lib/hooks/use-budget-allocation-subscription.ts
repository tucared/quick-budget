"use client"

import { useEffect, useRef } from "react"
import { useUser } from "./use-user"
import { RealtimeSubscriptionManager } from "./realtime-subscription-manager"

export type BudgetAllocationChangeCallback = () => void

// Singleton instance
const subscriptionManager = new RealtimeSubscriptionManager<BudgetAllocationChangeCallback>({
  table: "budget_allocations",
  channelPrefix: "budget_allocations_household",
  buildCallbackArgs: () => [] as [],
})

/**
 * Subscribe to real-time budget_allocations changes for the current household.
 * Calls the callback whenever any allocation is inserted, updated, or deleted.
 */
export function useBudgetAllocationSubscription(
  callback: BudgetAllocationChangeCallback,
  enabled = true
) {
  const { user, loading } = useUser()
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (!enabled || loading || !user?.householdId) return

    const unsubscribe = subscriptionManager.subscribe(user.householdId, (() => {
      callbackRef.current()
    }) as BudgetAllocationChangeCallback)

    return unsubscribe
  }, [enabled, loading, user?.householdId])
}
