// Browser-only persistence for the unlocked Household Data Key (HDK) so a page
// reload (or a new tab, or a browser restart) doesn't re-prompt for the password
// — the M4 "vault lifecycle on app pages" decision: persist the HDK as a
// NON-extractable CryptoKey in IndexedDB.
//
// Why a CryptoKey in IndexedDB rather than raw bytes in localStorage: IndexedDB
// structured-clones a CryptoKey while preserving `extractable: false`, so the
// stored key can still encrypt/decrypt row blobs but its raw bytes cannot be
// read back out — an XSS that reaches the cache can use the key on-page but can't
// exfiltrate it. This is purely a local-device hardening; it does not affect
// admin-blindness (the Supabase admin never touches the browser's IndexedDB).
//
// Scope: keyed by `${householdId}:${userId}` so two accounts on one browser don't
// collide. Cleared on explicit lock/logout. This module is the IO seam (like
// `vault-repo.ts` for Supabase) and is intentionally NOT re-exported from
// `index.ts`, so the Node/happy-dom unit tests that import the crypto barrel
// never pull in `indexedDB`.

import { Vault } from "./vault"

const DB_NAME = "qb-vault"
const STORE = "hdk"
const DB_VERSION = 1

function cacheKey(householdId: string, userId: string): string {
  return `${householdId}:${userId}`
}

// IndexedDB is absent in SSR and some privacy modes; callers treat a missing
// store as "no cache" and fall back to the password prompt.
function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined"
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = run(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Persist a freshly-unlocked vault's HDK so later reloads rehydrate without a
 * password prompt. Best-effort: a cache failure (private mode, quota) is
 * swallowed — the app still works, the user is just re-prompted next reload.
 */
export async function cacheVault(vault: Vault): Promise<void> {
  if (!hasIndexedDb()) return
  try {
    const key = await vault.exportForCache()
    const db = await openDb()
    try {
      await tx(db, "readwrite", (s) => s.put(key, cacheKey(vault.householdId, vault.userId)))
    } finally {
      db.close()
    }
  } catch {
    // Non-fatal: persistence is an optimization, not a correctness requirement.
  }
}

/**
 * Rehydrate the cached HDK for this user into a (private-key-less) Vault. Returns
 * null when there's no cache, IndexedDB is unavailable, or the stored value is
 * not a usable CryptoKey (e.g. a schema change) — every case means "prompt for
 * the password".
 */
export async function loadCachedVault(householdId: string, userId: string): Promise<Vault | null> {
  if (!hasIndexedDb()) return null
  try {
    const db = await openDb()
    try {
      const stored = await tx<unknown>(db, "readonly", (s) =>
        s.get(cacheKey(householdId, userId)),
      )
      if (!(stored instanceof CryptoKey)) return null
      return Vault._fromHdk(householdId, userId, stored)
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

/** Drop the cached HDK on lock/logout. Best-effort. */
export async function clearCachedVault(householdId?: string, userId?: string): Promise<void> {
  if (!hasIndexedDb()) return
  try {
    const db = await openDb()
    try {
      await tx(db, "readwrite", (s) =>
        householdId && userId ? s.delete(cacheKey(householdId, userId)) : s.clear(),
      )
    } finally {
      db.close()
    }
  } catch {
    // Non-fatal.
  }
}
