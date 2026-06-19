"use client"

// Decrypt-on-render hook for an expense row's description (M5 read path). Every
// displayed expense flows through ExpenseCard, so calling this there covers all
// read paths uniformly — server-hydrated rows, client refetches, and realtime
// broadcasts (each carries enc_blob, since the RPC uses to_jsonb(e) and client
// fetches select *).
//
// Starts from the plaintext column so plaintext rows (Tricount/legacy, or a
// locked vault) render with no flash, then swaps to the decrypted value once the
// async decryption settles. A decryption failure falls back to plaintext inside
// resolveExpenseDescription.

import { useEffect, useState } from "react"
import { useVault } from "@/lib/contexts/vault-context"
import { resolveExpenseDescription, type DecryptableExpense } from "./encryption"

export function useDecryptedDescription(row: DecryptableExpense): string | null {
  const { vault } = useVault()
  const { id, description, enc_blob } = row
  const [resolved, setResolved] = useState<string | null>(description ?? null)

  useEffect(() => {
    let cancelled = false
    void resolveExpenseDescription(vault, { id, description, enc_blob }).then((value) => {
      if (!cancelled) setResolved(value)
    })
    return () => {
      cancelled = true
    }
  }, [vault, id, description, enc_blob])

  return resolved
}
