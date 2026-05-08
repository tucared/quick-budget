"use client"

// TEMP diagnostic badge — renders the live realtime subscription status for
// the expense and budget_allocation channels in a fixed banner at the bottom
// of the screen. Visible everywhere inside the app shell. Remove this file,
// its import in app-layout-client.tsx, and src/lib/realtime-debug.ts once
// the realtime issue is settled.

import { useRealtimeDebugSnapshot, type ChannelStatus } from "@/lib/realtime-debug"

const COLORS: Record<string, string> = {
  SUBSCRIBED: "bg-green-600 text-white",
  CHANNEL_ERROR: "bg-red-600 text-white",
  TIMED_OUT: "bg-yellow-500 text-black",
  CLOSED: "bg-zinc-500 text-white",
  INIT: "bg-zinc-400 text-black",
}

function colorFor(status: string): string {
  return COLORS[status] ?? "bg-zinc-700 text-white"
}

function ChannelLine({ name, snap }: { name: string; snap: ChannelStatus }) {
  return (
    <div className={`flex items-center justify-between gap-2 px-2 py-1 ${colorFor(snap.status)}`}>
      <span className="font-mono text-xs font-bold uppercase">{name}</span>
      <span className="font-mono text-xs">{snap.status}</span>
      <span className="font-mono text-xs">{snap.events} ev</span>
      {snap.lastError && (
        <span className="font-mono text-[10px] truncate max-w-[40%]" title={snap.lastError}>
          {snap.lastError}
        </span>
      )}
    </div>
  )
}

export function RealtimeDebugBadge() {
  const snapshot = useRealtimeDebugSnapshot()
  const channels = ["expenses", "budget_allocations"]
  const hasAny = channels.some((c) => snapshot[c])

  if (!hasAny) {
    return (
      <div className="fixed left-2 right-2 bottom-20 z-50 rounded-md border-2 border-zinc-400 bg-zinc-200 text-black px-3 py-2 text-xs font-mono shadow-lg">
        RT: waiting for first status...
      </div>
    )
  }

  return (
    <div className="fixed left-2 right-2 bottom-20 z-50 rounded-md border-2 border-black overflow-hidden shadow-lg">
      <div className="bg-black text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
        Realtime debug (TEMP)
      </div>
      {channels.map((name) => {
        const snap = snapshot[name] ?? { status: "INIT", events: 0 }
        return <ChannelLine key={name} name={name} snap={snap} />
      })}
    </div>
  )
}
