"use client"

// Unlock prompt for the E2E vault (M4). Rendered by the app layout around the
// page content. The vault is normally rehydrated from the IndexedDB cache after
// login, so this prompt only surfaces when there's no cached key (new device,
// cleared storage, eviction) — the user re-enters their password to re-derive
// and re-cache the HDK.
//
// NON-BLOCKING for now: no row fields are encrypted yet, so the gate offers a
// "Not now" escape that lets the user into the app unlocked-or-not. When field
// encryption lands (M6) this becomes mandatory — drop `onSkip` and always block.

import { useState } from "react"
import { useVault, type VaultUnlockResult } from "@/lib/contexts/vault-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

function messageFor(reason: Exclude<VaultUnlockResult, { ok: true }>["reason"]): string {
  switch (reason) {
    case "bad-password":
      return "That password didn't unlock your data. Try again."
    case "pending-grant":
      return "Your account is set up but a household partner needs to log in once to grant you access. You can keep using the app meanwhile."
    case "no-key-material":
      return "No encryption keys found for this account yet. You can keep using the app."
    case "network":
      return "Couldn't reach the server. Check your connection and try again."
    case "no-session":
      return "Your session expired. Please log in again."
    default:
      return "Couldn't unlock your data. Try again."
  }
}

export function UnlockGate({ children }: { children: React.ReactNode }) {
  const { status, unlock } = useVault()
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [skipped, setSkipped] = useState(false)

  // Show children while loading the cache (avoids a flash) and once unlocked or
  // explicitly skipped. Only an actual "locked" state gates.
  if (status !== "locked" || skipped) return <>{children}</>

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    const result = await unlock(password)
    if (result.ok) {
      setPassword("")
      setLoading(false)
      return
    }
    setError(messageFor(result.reason))
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-none bg-transparent">
        <CardHeader className="text-center">
          <CardTitle className="text-sm font-medium uppercase tracking-[0.15em]">
            Unlock your data
          </CardTitle>
        </CardHeader>
        <form onSubmit={handleUnlock}>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Enter your password to unlock your household&apos;s encrypted data on this
              device. We&apos;ll remember it on this browser until you log out.
            </p>
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="vault-password">Password</Label>
              <Input
                id="vault-password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                autoFocus
              />
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Unlocking..." : "Unlock"}
            </Button>
            <button
              type="button"
              onClick={() => setSkipped(true)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Not now
            </button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
