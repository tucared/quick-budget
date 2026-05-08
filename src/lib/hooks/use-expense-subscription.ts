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
 * Backed by a Postgres trigger that calls realtime.broadcast_changes() —
 * postgres_changes is broken on this project.
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
      .channel(`expenses_household_${user.householdId}`, {
        config: { private: true },
      })
      .on(
        "broadcast",
        { event: "*" },
        (msg) => {
          const p = msg.payload as {
            operation?: string
            record?: unknown
            old_record?: unknown
          }
          if (p.operation !== "INSERT" && p.operation !== "UPDATE" && p.operation !== "DELETE") return
          callbackRef.current({
            type: p.operation,
            new: p.record,
            old: p.old_record,
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, loading, user?.householdId])
}
