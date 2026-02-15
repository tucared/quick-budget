"use client"

import { useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { useUser } from "./use-user"

// Expense change event types
export type ExpenseChangeEvent = {
  type: "INSERT" | "UPDATE" | "DELETE"
  new?: unknown
  old?: unknown
}

// Callback type for expense changes
export type ExpenseChangeCallback = (event: ExpenseChangeEvent) => void

// Module-level subscription manager with household-scoped channels
class ExpenseSubscriptionManager {
  private householdSubscribers = new Map<
    string,
    Set<ExpenseChangeCallback>
  >()
  private channels = new Map<string, RealtimeChannel>()
  private supabase = createClient()

  subscribe(
    householdId: string,
    callback: ExpenseChangeCallback
  ): () => void {
    // Get or create subscriber set for this household
    if (!this.householdSubscribers.has(householdId)) {
      this.householdSubscribers.set(householdId, new Set())
    }
    const subscribers = this.householdSubscribers.get(householdId)!

    // Add subscriber
    subscribers.add(callback)

    // Create subscription if this is the first subscriber for this household
    if (subscribers.size === 1 && !this.channels.has(householdId)) {
      this.createSubscription(householdId)
    }

    // Return unsubscribe function
    return () => {
      subscribers.delete(callback)

      // Clean up subscription if no more subscribers for this household
      if (subscribers.size === 0) {
        this.cleanup(householdId)
      }
    }
  }

  private createSubscription(householdId: string) {
    // Create a household-specific channel
    const channelName = `expenses_household_${householdId}`

    const channel = this.supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expenses",
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          const event: ExpenseChangeEvent = {
            type: payload.eventType as "INSERT" | "UPDATE" | "DELETE",
            new: payload.new,
            old: payload.old,
          }

          // Notify all subscribers for this household
          const subscribers = this.householdSubscribers.get(householdId)
          subscribers?.forEach((callback) => {
            try {
              callback(event)
            } catch (error) {
              console.error("Error in expense subscription callback:", error)
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

// Singleton instance
const subscriptionManager = new ExpenseSubscriptionManager()

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
      (event) => {
        callbackRef.current(event)
      }
    )

    return unsubscribe
  }, [enabled, loading, user?.householdId])
}
