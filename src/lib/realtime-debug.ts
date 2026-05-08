// TEMP diagnostic — module-scoped pubsub so the realtime subscription hooks
// can publish their status (SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / etc) and
// event counts to a single in-page badge. Remove this file and its callers
// once we've finished diagnosing the realtime subscription issue.

"use client"

import { useEffect, useState } from "react"

export type ChannelStatus = {
  status: string
  events: number
  lastError?: string
  lastEventAt?: number
}

const state: Record<string, ChannelStatus> = {}
const listeners = new Set<(snapshot: Record<string, ChannelStatus>) => void>()

function notify() {
  const snapshot = { ...state }
  listeners.forEach((l) => l(snapshot))
}

export function setRealtimeStatus(channel: string, status: string, error?: unknown) {
  const prev = state[channel] ?? { status: "INIT", events: 0 }
  state[channel] = {
    ...prev,
    status,
    lastError: error ? String((error as { message?: string }).message ?? error) : prev.lastError,
  }
  notify()
}

export function bumpRealtimeEvent(channel: string) {
  const prev = state[channel] ?? { status: "INIT", events: 0 }
  state[channel] = {
    ...prev,
    events: prev.events + 1,
    lastEventAt: Date.now(),
  }
  notify()
}

export function useRealtimeDebugSnapshot(): Record<string, ChannelStatus> {
  const [snap, setSnap] = useState<Record<string, ChannelStatus>>(() => ({ ...state }))
  useEffect(() => {
    listeners.add(setSnap)
    return () => {
      listeners.delete(setSnap)
    }
  }, [])
  return snap
}
