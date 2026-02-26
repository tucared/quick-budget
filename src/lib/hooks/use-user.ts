import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase"
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
          data: { user: authUser },
          error: authError,
        } = await supabase.auth.getUser()

        if (authError) {
          setError("Failed to load user session")
          setLoading(false)
          return
        }

        if (!authUser) {
          setError("Not authenticated")
          setLoading(false)
          return
        }

        // Get user details from users table
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
