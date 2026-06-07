"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, Link2, Unlink, AlertTriangle, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { TricountLink } from "@/lib/types"

interface SyncResult {
  title: string
  created: number
  updated: number
  deleted: number
  skipped: number
  unmatchedMembers: string[]
}

export function TricountSyncClient({ initialLink }: { initialLink: TricountLink | null }) {
  const router = useRouter()
  const [link, setLink] = useState<TricountLink | null>(initialLink)
  const [url, setUrl] = useState("")
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)

  async function runSync() {
    setBusy("sync")
    setError(null)
    try {
      const res = await fetch("/api/tricount/sync", { method: "POST" })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || "Sync failed")
        return
      }
      if (data.result) {
        setResult(data.result as SyncResult)
        // Reflect new/updated/removed expenses elsewhere in the app.
        router.refresh()
      }
    } catch {
      setError("Sync failed — network error")
    } finally {
      setBusy(null)
    }
  }

  async function connect() {
    setBusy("connect")
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/tricount/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || "Could not connect that link")
        return
      }
      setLink(data.link as TricountLink)
      setUrl("")
      // Immediately pull the ledger so the user sees results without a second tap.
      await runSync()
    } catch {
      setError("Could not connect — network error")
    } finally {
      setBusy(null)
    }
  }

  async function disconnect() {
    setBusy("disconnect")
    setError(null)
    try {
      const res = await fetch("/api/tricount/link", { method: "DELETE" })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || "Could not disconnect")
        return
      }
      setLink(null)
      setResult(null)
    } catch {
      setError("Could not disconnect — network error")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">Tricount sync</h2>
        <p className="text-xs text-muted-foreground">
          Mirror your household&apos;s share of a Tricount ledger into Quick Budget. Your
          share is the sum of allocations for members matched to this household — amounts
          shared with outsiders are left out. Synced expenses land in the{" "}
          <span className="font-medium">Tricount</span> category.
        </p>
      </div>

      {!link ? (
        <div className="space-y-3">
          <label htmlFor="tricount-url" className="text-xs font-medium text-foreground">
            Tricount share link
          </label>
          <Input
            id="tricount-url"
            placeholder="https://tricount.com/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            inputMode="url"
            autoComplete="off"
          />
          <Button onClick={connect} disabled={!url.trim() || busy !== null} className="gap-2">
            {busy === "connect" || busy === "sync" ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            Connect &amp; sync
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 border-b pb-3">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">
                {link.title || "Connected tricount"}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {link.last_synced_at
                  ? `Last synced ${new Date(link.last_synced_at).toLocaleString()}`
                  : "Not synced yet"}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button onClick={runSync} disabled={busy !== null} size="sm" className="gap-2">
                <RefreshCw className={`h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`} />
                Sync now
              </Button>
              <Button
                onClick={disconnect}
                disabled={busy !== null}
                size="sm"
                variant="ghost"
                className="gap-2 text-muted-foreground"
                aria-label="Disconnect tricount"
              >
                <Unlink className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {result && (
            <div className="rounded-md border bg-card p-3 text-xs space-y-2">
              <div className="flex items-center gap-2 font-medium">
                <Check className="h-4 w-4" />
                Synced “{result.title}”
              </div>
              <div className="text-muted-foreground">
                {result.created} added · {result.updated} updated · {result.deleted} removed ·{" "}
                {result.skipped} unchanged
              </div>
              {result.unmatchedMembers.length > 0 && (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-accent" />
                  <span>
                    Not matched to a household member (their share is excluded):{" "}
                    {result.unmatchedMembers.join(", ")}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
