import { createClient } from "@/lib/supabase"
import type { RealtimeChannel } from "@supabase/supabase-js"

export interface RealtimeSubscriptionManagerConfig<TCallback extends (...args: never[]) => void> {
  /** Supabase table to listen on */
  table: string
  /** Channel name prefix (e.g. "expenses_household") */
  channelPrefix: string
  /** Transform the raw postgres_changes payload into callback arguments */
  buildCallbackArgs: (payload: { eventType: string; new: unknown; old: unknown }) => Parameters<TCallback>
}

/**
 * Generic singleton manager for Supabase Realtime subscriptions.
 * Manages one channel per household, shared across all hook consumers.
 */
export class RealtimeSubscriptionManager<TCallback extends (...args: never[]) => void> {
  private householdSubscribers = new Map<string, Set<TCallback>>()
  private channels = new Map<string, RealtimeChannel>()
  private supabase: ReturnType<typeof createClient> | null = null
  private config: RealtimeSubscriptionManagerConfig<TCallback>

  constructor(config: RealtimeSubscriptionManagerConfig<TCallback>) {
    this.config = config
  }

  private getClient() {
    if (!this.supabase) {
      this.supabase = createClient()
    }
    return this.supabase
  }

  subscribe(householdId: string, callback: TCallback): () => void {
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

  private async createSubscription(householdId: string) {
    // Ensure a valid auth session exists before subscribing to Realtime.
    // Without this, the websocket connects without a token and gets rejected.
    const client = this.getClient()
    const { data: { session } } = await client.auth.getSession()

    // Check if we were cleaned up while awaiting, if another creation already
    // won the race (React strict mode / HMR), or if auth is invalid
    if (!this.householdSubscribers.get(householdId)?.size) return
    if (this.channels.has(householdId)) return
    if (!session) {
      console.warn(`${this.config.table} subscription skipped: no valid auth session`)
      return
    }

    const channel = client
      .channel(`${this.config.channelPrefix}_${householdId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: this.config.table,
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          const args = this.config.buildCallbackArgs(payload as { eventType: string; new: unknown; old: unknown })
          const subscribers = this.householdSubscribers.get(householdId)
          subscribers?.forEach((cb) => {
            try {
              cb(...args)
            } catch (error) {
              console.error(`Error in ${this.config.table} subscription callback:`, error)
            }
          })
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`${this.config.table} subscription ${status}:`, err)
          this.removeChannel(householdId)
          const subscribers = this.householdSubscribers.get(householdId)
          if (subscribers && subscribers.size > 0) {
            setTimeout(() => {
              if (this.householdSubscribers.get(householdId)?.size) {
                this.createSubscription(householdId)
              }
            }, 5000)
          }
        } else if (status === "CLOSED") {
          console.debug(`${this.config.table} subscription closed`)
        }
      })

    this.channels.set(householdId, channel)
  }

  private removeChannel(householdId: string) {
    const channel = this.channels.get(householdId)
    if (channel) {
      this.getClient().removeChannel(channel)
      this.channels.delete(householdId)
    }
  }

  private cleanup(householdId: string) {
    this.removeChannel(householdId)
    this.householdSubscribers.delete(householdId)
  }
}
