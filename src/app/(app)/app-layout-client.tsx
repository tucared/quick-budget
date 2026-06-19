"use client"

import { useEffect, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase"
import { clearStorageKeys } from "@/lib/types"
import { Receipt, Wallet, RefreshCw, LogOut } from "lucide-react"
import { UserProvider } from "@/lib/contexts/user-context"
import { VaultProvider } from "@/lib/contexts/vault-context"
import { UnlockGate } from "@/components/vault/unlock-gate"
import { clearCachedVault } from "@/lib/crypto/vault-cache"
import type { UserData } from "@/lib/hooks/use-user"
import { useKeyboardVisible } from "@/lib/hooks/use-keyboard-visible"

const tabs = [
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/budget", label: "Budget", icon: Wallet },
  { href: "/sync", label: "Sync", icon: RefreshCw },
] as const

// Auto-sync the linked tricount once per browser session (this sessionStorage
// gate), backed by a server-side `auto: true` throttle that also skips links
// reconciled in the last 10 min across both partners and all tabs/devices — so
// the undocumented Tricount API isn't re-hit on every reload. The endpoint
// no-ops quickly when no tricount is connected. Refreshes the route tree only
// when the reconcile actually changed something, so it's cheap on a steady state.
function useTricountAutoSync() {
  const router = useRouter()
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    try {
      if (sessionStorage.getItem("qb:tricount-autosynced")) return
      sessionStorage.setItem("qb:tricount-autosynced", "1")
    } catch {
      // sessionStorage unavailable — fall through and sync this load.
    }
    void (async () => {
      try {
        const res = await fetch("/api/tricount/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auto: true }),
        })
        if (!res.ok) return
        const data = await res.json()
        const changed = (data?.results ?? []).some(
          (r: { result?: { created: number; updated: number; deleted: number } }) =>
            r.result && (r.result.created > 0 || r.result.updated > 0 || r.result.deleted > 0)
        )
        if (changed) router.refresh()
      } catch {
        // Best-effort background sync; ignore failures.
      }
    })()
  }, [router])
}

export default function AppLayoutClient({
  children,
  initialUser,
}: {
  children: React.ReactNode
  initialUser: UserData | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const isKeyboardVisible = useKeyboardVisible()
  useTricountAutoSync()

  const handleLogout = async () => {
    clearStorageKeys()
    // Drop the cached HDK so the next user on this browser can't reuse it.
    await clearCachedVault()
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <UserProvider initialUser={initialUser}>
      <VaultProvider>
      <UnlockGate>
      <div className="min-h-screen bg-background">
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-foreground text-primary-foreground">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <h1 className="text-sm font-semibold">Quick Budget</h1>
            <button
              onClick={handleLogout}
              className="text-primary-foreground/60 hover:text-primary-foreground transition-colors p-1"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className="pb-16">{children}</div>

        {/* Bottom tab bar — hidden when mobile keyboard is open */}
        {!isKeyboardVisible && <nav className="fixed bottom-0 left-0 right-0 z-10 bg-card border-t">
          <div className="flex">
            {tabs.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${
                    isActive
                      ? "text-accent font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              )
            })}
          </div>
        </nav>}
      </div>
      </UnlockGate>
      </VaultProvider>
    </UserProvider>
  )
}
