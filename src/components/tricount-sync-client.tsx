"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, Link2, Unlink, AlertTriangle, Users, Check, Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { TricountLink } from "@/lib/types"
import { formatCurrency } from "@/lib/currency"
import {
  resolveMembers,
  type HouseholdUser,
  type RegistryMember,
  type MemberMap,
} from "@/lib/tricount/mapping"
// Type-only import — erased at compile time, so the server-only sync module
// (node:crypto etc.) never enters the client bundle.
import type { SyncResult } from "@/lib/tricount/sync"

/** Per-link signed owe/owed totals (EUR). Mirrors getTricountLinkBalances. */
type LinkBalance = { paid: number; share: number }
type LinkResult = { linkId: string; title: string; result?: SyncResult; error?: string }

const EXCLUDE = "__exclude__"

export function TricountSyncClient({
  initialLinks,
  householdUsers,
  linkBalances,
}: {
  initialLinks: TricountLink[]
  householdUsers: HouseholdUser[]
  linkBalances: Record<string, LinkBalance>
}) {
  const router = useRouter()
  const [links, setLinks] = useState<TricountLink[]>(initialLinks)
  const [url, setUrl] = useState("")
  const [busy, setBusy] = useState<string | null>(null) // "add" | "all" | linkId | `map:${id}`
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, LinkResult>>({})
  const [editing, setEditing] = useState<string | null>(null)

  async function refetchLinks() {
    const res = await fetch("/api/tricount/link")
    if (res.ok) {
      const data = await res.json()
      setLinks(data.links as TricountLink[])
    }
  }

  function recordResults(rs: LinkResult[]) {
    setResults((prev) => {
      const next = { ...prev }
      for (const r of rs) next[r.linkId] = r
      return next
    })
  }

  async function syncRequest(linkId?: string) {
    const res = await fetch("/api/tricount/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(linkId ? { linkId } : {}),
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error || "Sync failed")
    recordResults((data.results ?? []) as LinkResult[])
  }

  async function syncOne(linkId: string) {
    setBusy(linkId)
    setError(null)
    try {
      await syncRequest(linkId)
      await refetchLinks()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed")
    } finally {
      setBusy(null)
    }
  }

  async function syncAll() {
    setBusy("all")
    setError(null)
    try {
      await syncRequest()
      await refetchLinks()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed")
    } finally {
      setBusy(null)
    }
  }

  async function connect() {
    setBusy("add")
    setError(null)
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
      setUrl("")
      const newId = (data.link as TricountLink).id
      await refetchLinks()
      // Immediately pull the ledger so members + expenses populate.
      await syncRequest(newId)
      await refetchLinks()
      router.refresh()
    } catch {
      setError("Could not connect — network error")
    } finally {
      setBusy(null)
    }
  }

  async function setActive(linkId: string, active: boolean) {
    setBusy(linkId)
    setError(null)
    try {
      const res = await fetch("/api/tricount/link", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: linkId, is_active: active }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || "Could not update")
        return
      }
      await refetchLinks()
      // Resuming pulls anything that changed while paused.
      if (active) {
        await syncRequest(linkId)
        await refetchLinks()
        router.refresh()
      }
    } catch {
      setError("Could not update — network error")
    } finally {
      setBusy(null)
    }
  }

  async function disconnect(linkId: string) {
    setBusy(linkId)
    setError(null)
    try {
      // Unlink always removes the mirrored expenses too (no orphan-leaving
      // "keep" variant). Pause is the way to freeze a finished tricount.
      const res = await fetch(`/api/tricount/link?id=${encodeURIComponent(linkId)}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || "Could not remove")
        return
      }
      await refetchLinks()
      // Deleting mirrored expenses changes the rest of the app.
      router.refresh()
    } catch {
      setError("Could not remove — network error")
    } finally {
      setBusy(null)
    }
  }

  async function saveMapping(linkId: string, memberMap: MemberMap) {
    setBusy(`map:${linkId}`)
    setError(null)
    try {
      const res = await fetch("/api/tricount/link", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: linkId, member_map: memberMap }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || "Could not save mapping")
        return
      }
      setEditing(null)
      // Re-sync so the new mapping reshapes shares/expenses immediately.
      await syncRequest(linkId)
      await refetchLinks()
      router.refresh()
    } catch {
      setError("Could not save mapping — network error")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">Tricount sync</h2>
        <p className="text-xs text-muted-foreground">
          Mirror your household&apos;s share of one or more Tricount ledgers into Quick
          Budget. Each expense&apos;s share is the sum of allocations for the members you
          assign to a household person (via the people icon) — everyone else is excluded,
          and unassigned members don&apos;t count until you map them. Synced rows land in the{" "}
          <span className="font-medium">Tricount</span> category, named after their tricount.
        </p>
      </div>

      {/* Connected tricounts */}
      {links.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Connected ({links.length})</span>
            <Button onClick={syncAll} disabled={busy !== null} size="sm" className="gap-2">
              <RefreshCw className={`h-4 w-4 ${busy === "all" ? "animate-spin" : ""}`} />
              Sync all
            </Button>
          </div>

          {links.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              householdUsers={householdUsers}
              balance={linkBalances[link.id]}
              result={results[link.id]}
              busy={busy}
              editing={editing === link.id}
              onToggleEdit={() => setEditing(editing === link.id ? null : link.id)}
              onSync={() => syncOne(link.id)}
              onSetActive={(a) => setActive(link.id, a)}
              onDisconnect={() => disconnect(link.id)}
              onSaveMapping={(m) => saveMapping(link.id, m)}
            />
          ))}
        </div>
      )}

      {/* Add a tricount */}
      <div className="space-y-3 border-t pt-4">
        <label htmlFor="tricount-url" className="text-xs font-medium text-foreground">
          {links.length > 0 ? "Add another tricount" : "Connect a tricount"}
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
          {busy === "add" ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
          Connect &amp; sync
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

function LinkCard({
  link,
  householdUsers,
  balance,
  result,
  busy,
  editing,
  onToggleEdit,
  onSync,
  onSetActive,
  onDisconnect,
  onSaveMapping,
}: {
  link: TricountLink
  householdUsers: HouseholdUser[]
  balance?: LinkBalance
  result?: LinkResult
  busy: string | null
  editing: boolean
  onToggleEdit: () => void
  onSync: () => void
  onSetActive: (active: boolean) => void
  onDisconnect: () => void
  onSaveMapping: (m: MemberMap) => void
}) {
  const paused = !link.is_active
  const [confirmRemove, setConfirmRemove] = useState(false)
  const members = (link.members ?? []) as unknown as RegistryMember[]
  const manual = (link.member_map ?? {}) as MemberMap
  const { resolved } = resolveMembers(members, householdUsers, manual)
  const mapped = resolved.filter((r) => r.status === "mapped").length
  const excluded = resolved.filter((r) => r.status === "excluded").length
  const needsMapping = resolved.filter((r) => r.status === "unset").length
  // Net owe/owed = household cash paid − household share consumed (signed EUR,
  // income included). Positive = you're owed, negative = you owe.
  const net = balance ? Math.round((balance.paid - balance.share) * 100) / 100 : null

  return (
    <div className={`rounded-md border bg-card p-3 space-y-3 ${paused ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate flex items-center gap-2">
            <span className="truncate">{link.title || "Connected tricount"}</span>
            {paused && (
              <span className="shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Paused
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {link.last_synced_at
              ? `Last synced ${new Date(link.last_synced_at).toLocaleString()}`
              : "Not synced yet"}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {paused ? (
            <Button onClick={() => onSetActive(true)} disabled={busy !== null} size="sm" className="gap-2">
              {busy === link.id ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Resume
            </Button>
          ) : (
            <>
              <Button onClick={onSync} disabled={busy !== null} size="sm" className="gap-2">
                <RefreshCw className={`h-4 w-4 ${busy === link.id ? "animate-spin" : ""}`} />
                Sync
              </Button>
              <Button
                onClick={() => onSetActive(false)}
                disabled={busy !== null}
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                aria-label="Pause syncing"
              >
                <Pause className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button
            onClick={onToggleEdit}
            disabled={busy !== null || members.length === 0 || paused}
            size="sm"
            variant="ghost"
            className="gap-1 text-muted-foreground"
            aria-label="Edit member mapping"
          >
            <Users className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => setConfirmRemove((v) => !v)}
            disabled={busy !== null}
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            aria-label="Remove tricount"
          >
            <Unlink className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {confirmRemove && (
        <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-2">
          <div className="font-medium">Unlink this tricount?</div>
          <p className="text-muted-foreground">
            This disconnects the tricount and deletes every expense it imported. To keep a
            finished tricount&apos;s expenses as history, pause it instead.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <Button
              onClick={() => { setConfirmRemove(false); onDisconnect() }}
              disabled={busy !== null}
              size="sm"
              variant="destructive"
            >
              Unlink &amp; delete
            </Button>
            <Button onClick={() => setConfirmRemove(false)} disabled={busy !== null} size="sm" variant="ghost">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {members.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {mapped} mapped · {excluded} excluded
          {needsMapping > 0 && (
            <button
              onClick={onToggleEdit}
              className="ml-1 text-accent font-medium underline-offset-2 hover:underline"
            >
              · {needsMapping} need mapping
            </button>
          )}
        </div>
      )}

      {net != null && (
        <div className="rounded-md bg-muted/40 px-2.5 py-2 text-xs space-y-0.5">
          <div className="text-muted-foreground">
            You paid {formatCurrency(balance!.paid)} · your share {formatCurrency(balance!.share)}
          </div>
          <div className="font-medium text-foreground">
            {Math.abs(net) < 0.005
              ? "Settled up"
              : net < 0
                ? `You owe ${formatCurrency(Math.abs(net))}`
                : `You're owed ${formatCurrency(net)}`}
          </div>
        </div>
      )}

      {result?.result && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Check className="h-3.5 w-3.5" />
          {result.result.created} added · {result.result.updated} updated ·{" "}
          {result.result.deleted} removed · {result.result.skipped} unchanged
          {result.result.skippedForRate > 0 && (
            <span className="text-[hsl(24,85%,42%)]">
              · {result.result.skippedForRate} awaiting exchange rate (retried next sync)
            </span>
          )}
        </div>
      )}
      {result?.error && (
        <div className="text-xs text-destructive flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {result.error}
        </div>
      )}

      {editing && (
        <MappingEditor
          members={members}
          householdUsers={householdUsers}
          manual={manual}
          saving={busy === `map:${link.id}`}
          onCancel={onToggleEdit}
          onSave={onSaveMapping}
        />
      )}
    </div>
  )
}

function MappingEditor({
  members,
  householdUsers,
  manual,
  saving,
  onCancel,
  onSave,
}: {
  members: RegistryMember[]
  householdUsers: HouseholdUser[]
  manual: MemberMap
  saving: boolean
  onCancel: () => void
  onSave: (m: MemberMap) => void
}) {
  const { resolved } = resolveMembers(members, householdUsers, manual)
  // Controlled selection per membership id: a user id, "__exclude__" (outsider),
  // or "" (unset — not yet decided).
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {}
    for (const r of resolved) {
      d[String(r.id)] = r.status === "mapped" ? r.userId! : r.status === "excluded" ? EXCLUDE : ""
    }
    return d
  })
  const [dirty, setDirty] = useState<Set<string>>(new Set())

  function change(id: string, value: string) {
    setDraft((prev) => ({ ...prev, [id]: value }))
    setDirty((prev) => new Set(prev).add(id))
  }

  function save() {
    // Preserve existing decisions; apply only what the user changed. "" clears
    // the entry back to unset; otherwise store the user id or null (exclude).
    const next: MemberMap = { ...manual }
    for (const id of dirty) {
      const v = draft[id]
      if (v === "") delete next[id]
      else next[id] = v === EXCLUDE ? null : v
    }
    onSave(next)
  }

  return (
    <div className="border-t pt-3 space-y-2">
      <div className="text-xs font-medium">Who is who?</div>
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3">
            <span className="text-sm truncate">{m.name}</span>
            <select
              value={draft[String(m.id)] ?? ""}
              onChange={(e) => change(String(m.id), e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs shrink-0"
            >
              <option value="">— Choose person —</option>
              {householdUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email}
                </option>
              ))}
              <option value={EXCLUDE}>Exclude (outsider)</option>
            </select>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button onClick={save} disabled={saving} size="sm" className="gap-2">
          {saving && <RefreshCw className="h-4 w-4 animate-spin" />}
          Save &amp; re-sync
        </Button>
        <Button onClick={onCancel} disabled={saving} size="sm" variant="ghost">
          Cancel
        </Button>
      </div>
    </div>
  )
}
