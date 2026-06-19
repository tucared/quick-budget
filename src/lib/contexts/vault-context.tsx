"use client"

// VaultProvider — holds the unlocked Household Data Key for the app session and
// keeps it alive across reloads via the IndexedDB cache (M4 "vault lifecycle on
// app pages"). On mount it rehydrates the HDK from the cache silently; the user
// only sees the unlock prompt when there's no cached key (new device, cleared
// storage, cache eviction). After a normal login the key is cached, so ordinary
// navigation never prompts.
//
// NOT YET LOAD-BEARING: no row fields are encrypted yet (that lands in M5/M6), so
// the gate is deliberately non-blocking — an `UnlockGate` consumer may let the
// user proceed without unlocking. Once fields are actually encrypted, the gate
// becomes mandatory (decryption needs the HDK) and the "skip" escape is removed.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createClient } from "@/lib/supabase"
import {
  createSupabaseVaultStore,
  unlockVault,
  Vault,
  VaultError,
  type VaultErrorCode,
} from "@/lib/crypto"
import { cacheVault, clearCachedVault, loadCachedVault } from "@/lib/crypto/vault-cache"
import { useUser } from "./user-context"

export type VaultStatus = "loading" | "unlocked" | "locked"

export type VaultUnlockResult =
  | { ok: true }
  | { ok: false; reason: VaultErrorCode | "network" | "no-session" }

interface VaultContextValue {
  vault: Vault | null
  status: VaultStatus
  unlock: (password: string) => Promise<VaultUnlockResult>
  lock: () => Promise<void>
}

const VaultContext = createContext<VaultContextValue | undefined>(undefined)

export function VaultProvider({ children }: { children: ReactNode }) {
  const { user } = useUser()
  const [vault, setVault] = useState<Vault | null>(null)
  const [status, setStatus] = useState<VaultStatus>("loading")
  // Guard the rehydrate effect so it runs once per (household, user) identity.
  const rehydratedFor = useRef<string | null>(null)

  const householdId = user?.householdId ?? null
  const userId = user?.id ?? null

  // Rehydrate the cached HDK once the user identity is known.
  useEffect(() => {
    if (!householdId || !userId) return
    const identity = `${householdId}:${userId}`
    if (rehydratedFor.current === identity) return
    rehydratedFor.current = identity

    let cancelled = false
    setStatus("loading")
    void (async () => {
      const cached = await loadCachedVault(householdId, userId)
      if (cancelled) return
      if (cached) {
        setVault(cached)
        setStatus("unlocked")
      } else {
        setVault(null)
        setStatus("locked")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [householdId, userId])

  const unlock = useCallback(
    async (password: string): Promise<VaultUnlockResult> => {
      if (!userId) return { ok: false, reason: "no-session" }
      const supabase = createClient()
      const store = createSupabaseVaultStore(supabase)
      try {
        const unlocked = await unlockVault({ store, userId, password })
        await cacheVault(unlocked)
        setVault(unlocked)
        setStatus("unlocked")
        return { ok: true }
      } catch (err) {
        if (err instanceof VaultError) return { ok: false, reason: err.code }
        return { ok: false, reason: "network" }
      }
    },
    [userId],
  )

  const lock = useCallback(async () => {
    await clearCachedVault(householdId ?? undefined, userId ?? undefined)
    setVault(null)
    setStatus("locked")
  }, [householdId, userId])

  return (
    <VaultContext.Provider value={{ vault, status, unlock, lock }}>
      {children}
    </VaultContext.Provider>
  )
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext)
  if (ctx === undefined) throw new Error("useVault must be used within a VaultProvider")
  return ctx
}
