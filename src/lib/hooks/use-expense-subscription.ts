"use client"

import { useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase"
import { useUser } from "@/lib/contexts/user-context"

export type ExpenseChangeEvent = {
  type: "INSERT" | "UPDATE" | "DELETE"
  new?: unknown
  old?: unknown
}

export type ExpenseChangeCallback = (event: ExpenseChangeEvent) => void

/**
 * Subscribe to real-time expense changes for the current user's household.
 * Creates a household-scoped Supabase Realtime channel.
 */
export function useExpenseSubscription(
  callback: ExpenseChangeCallback,
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
      .channel(`expenses_household_${user.householdId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expenses",
          filter: `household_id=eq.${user.householdId}`,
        },
        (payload) => {
          callbackRef.current({
            type: payload.eventType as "INSERT" | "UPDATE" | "DELETE",
            new: payload.new,
            old: payload.old,
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, loading, user?.householdId])
}
