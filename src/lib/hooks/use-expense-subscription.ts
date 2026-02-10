"use client"

import { useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase"
import type { RealtimeChannel } from "@supabase/supabase-js"

// Expense change event types
export type ExpenseChangeEvent = {
  type: "INSERT" | "UPDATE" | "DELETE"
  new?: any
  old?: any
}

// Callback type for expense changes
export type ExpenseChangeCallback = (event: ExpenseChangeEvent) => void

// Module-level subscription manager
class ExpenseSubscriptionManager {
  private subscribers = new Set<ExpenseChangeCallback>()
  private channel: RealtimeChannel | null = null
  private supabase = createClient()

  subscribe(callback: ExpenseChangeCallback): () => void {
    // Add subscriber
    this.subscribers.add(callback)

    // Create subscription if this is the first subscriber
    if (this.subscribers.size === 1 && !this.channel) {
      this.createSubscription()
    }

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback)

      // Clean up subscription if no more subscribers
      if (this.subscribers.size === 0) {
        this.cleanup()
      }
    }
  }

  private createSubscription() {
    this.channel = this.supabase
      .channel("shared_expenses_subscription")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expenses",
        },
        (payload) => {
          const event: ExpenseChangeEvent = {
            type: payload.eventType as "INSERT" | "UPDATE" | "DELETE",
            new: payload.new,
            old: payload.old,
          }

          // Notify all subscribers
          this.subscribers.forEach((callback) => {
            try {
              callback(event)
            } catch (error) {
              console.error("Error in expense subscription callback:", error)
            }
          })
        }
      )
      .subscribe()
  }

  private cleanup() {
    if (this.channel) {
      this.supabase.removeChannel(this.channel)
      this.channel = null
    }
  }
}

// Singleton instance
const subscriptionManager = new ExpenseSubscriptionManager()

/**
 * Hook to subscribe to real-time expense changes.
 * Uses a shared subscription that's created when the first component subscribes
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
  const callbackRef = useRef(callback)

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (!enabled) return

    // Subscribe with a stable wrapper that uses the ref
    const unsubscribe = subscriptionManager.subscribe((event) => {
      callbackRef.current(event)
    })

    return unsubscribe
  }, [enabled])
}
