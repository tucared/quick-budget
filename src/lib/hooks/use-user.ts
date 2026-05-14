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

        // Prefer household_id from the JWT custom claim populated by the
        // private.custom_access_token_hook auth hook (see
        // supabase/schemas/02_tables.sql). The claim lives in the encoded
        // access token, not on authUser.app_metadata — supabase-js
        // populates that field from the auth.users row, not the JWT.
        const claimHouseholdId = decodeJwtClaim(session?.access_token, [
          "app_metadata",
          "household_id",
        ])

        if (claimHouseholdId) {
          setUser({
            id: authUser.id,
            email: authUser.email,
            fullName: authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "User",
            householdId: claimHouseholdId,
          })
          setLoading(false)
          return
        }

        // Fallback for access tokens issued before the hook was enabled.
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("full_name, household_id")
          .eq("id", authUser.id)
          .single()

        if (userError) {
          setError("Failed to load user details")
          setLoading(false)
          return
        }

        if (!userData?.household_id) {
          setError("User is not associated with a household")
          setLoading(false)
          return
        }

        // Set user data with display name fallback
        setUser({
          id: authUser.id,
          email: authUser.email,
          fullName: userData.full_name || authUser.email?.split("@")[0] || "User",
          householdId: userData.household_id,
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
