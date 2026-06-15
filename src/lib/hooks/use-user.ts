import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase"
import { decodeJwtClaim } from "@/lib/jwt-claim"
import type { UserData } from "@/lib/types"

export type { UserData }

/**
 * Custom hook to load the current authenticated user and their details
 * Returns the user's display name and household ID
 */
export function useUser(initialUser?: UserData | null) {
  const [user, setUser] = useState<UserData | null>(initialUser ?? null)
  const [loading, setLoading] = useState(initialUser === undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Skip client-side fetch when server-provided data is available
    if (initialUser !== undefined) return

    const loadUser = async () => {
      try {
        const supabase = createClient()
        const {
          data: { session },
          error: authError,
        } = await supabase.auth.getSession()

        if (authError) {
          setError("Failed to load user session")
          setLoading(false)
          return
        }

        const authUser = session?.user
        if (!authUser) {
          setError("Not authenticated")
          setLoading(false)
          return
        }

        // Intentionally unverified: client-side UI hint only. PostgREST
        // re-verifies the JWT on every data call and RLS gates by the
        // verified auth.jwt() context. The server uses verifyAccessToken()
        // (jwt-verify.ts) for the trusted read.
        // Claim lives in the encoded token, not authUser.app_metadata —
        // supabase-js populates that field from auth.users, not the JWT.
        const claimHouseholdId = decodeJwtClaim(session?.access_token, [
          "app_metadata",
          "household_id",
        ])

        if (!claimHouseholdId) {
          setError("User is not associated with a household")
          setLoading(false)
          return
        }

        // Base/secondary currency live on the households row. The server-
        // hydrated initialUser carries them in the common case; this client
        // fallback fetches them (RLS-scoped) and defaults to EUR/BRL if absent.
        const { data: household } = await supabase
          .from("households")
          .select("base_currency, secondary_currency")
          .eq("id", claimHouseholdId)
          .maybeSingle()

        setUser({
          id: authUser.id,
          email: authUser.email,
          fullName: authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "User",
          householdId: claimHouseholdId,
          baseCurrency: household?.base_currency ?? "EUR",
          secondaryCurrency: household?.secondary_currency ?? "BRL",
        })
        setLoading(false)
      } catch (_err) {
        setError("An unexpected error occurred")
        setLoading(false)
      }
    }

    loadUser()
  }, [initialUser])

  return { user, loading, error }
}
