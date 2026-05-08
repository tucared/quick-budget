"use client"

import { useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase"
import { useUser } from "@/lib/contexts/user-context"

export type BudgetAllocationChangeCallback = () => void

/**
 * Subscribe to real-time budget_allocations changes for the current household.
 * Backed by a Postgres trigger that calls realtime.broadcast_changes() —
 * postgres_changes is broken on this project.
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

    const supabase = createClient()
    const channel = supabase
      .channel(`budget_allocations_household_${user.householdId}`, {
        config: { private: true },
      })
      .on(
        "broadcast",
        { event: "*" },
        () => {
          callbackRef.current()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, loading, user?.householdId])
}
