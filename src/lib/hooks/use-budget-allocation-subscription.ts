"use client"

import { useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { useUser } from "./use-user"

export type BudgetAllocationChangeCallback = () => void

class BudgetAllocationSubscriptionManager {
  private householdSubscribers = new Map<string, Set<BudgetAllocationChangeCallback>>()
  private channels = new Map<string, RealtimeChannel>()
  private supabase = createClient()

  subscribe(householdId: string, callback: BudgetAllocationChangeCallback): () => void {
    if (!this.householdSubscribers.has(householdId)) {
      this.householdSubscribers.set(householdId, new Set())
    }
    const subscribers = this.householdSubscribers.get(householdId)!
    subscribers.add(callback)

    if (subscribers.size === 1 && !this.channels.has(householdId)) {
      this.createSubscription(householdId)
    }

    return () => {
      subscribers.delete(callback)
      if (subscribers.size === 0) {
        this.cleanup(householdId)
      }
    }
  }

  private createSubscription(householdId: string) {
    const channel = this.supabase
      .channel(`budget_allocations_household_${householdId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "budget_allocations",
          filter: `household_id=eq.${householdId}`,
        },
        () => {
          const subscribers = this.householdSubscribers.get(householdId)
          subscribers?.forEach((cb) => {
            try {
              cb()
            } catch (error) {
              console.error("Error in budget allocation subscription callback:", error)
            }
          })
        }
      )
      .subscribe()

    this.channels.set(householdId, channel)
  }

  private cleanup(householdId: string) {
    const channel = this.channels.get(householdId)
    if (channel) {
      this.supabase.removeChannel(channel)
      this.channels.delete(householdId)
    }
    this.householdSubscribers.delete(householdId)
  }
}

const subscriptionManager = new BudgetAllocationSubscriptionManager()

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

    const unsubscribe = subscriptionManager.subscribe(user.householdId, () => {
      callbackRef.current()
    })

    return unsubscribe
  }, [enabled, loading, user?.householdId])
}
