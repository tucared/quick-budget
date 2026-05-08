"use client"

import { useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase"
import { useUser } from "@/lib/contexts/user-context"
import { setRealtimeStatus, bumpRealtimeEvent } from "@/lib/realtime-debug"

export type BudgetAllocationChangeCallback = () => void

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

    const supabase = createClient()
    const channel = supabase
      .channel(`budget_allocations_household_${user.householdId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "budget_allocations",
          filter: `household_id=eq.${user.householdId}`,
        },
        () => {
          // TEMP diagnostic
          console.log("[realtime budget_allocations] event")
          bumpRealtimeEvent("budget_allocations")
          callbackRef.current()
        }
      )
      .subscribe((status, err) => {
        // TEMP diagnostic
        console.log("[realtime budget_allocations] status:", status, err)
        setRealtimeStatus("budget_allocations", status, err)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, loading, user?.householdId])
}
