import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase"
import UpdatePasswordForm from "./update-password-form"

/**
 * Set-password page, reached after /auth/callback has exchanged a recovery
 * link for a session. Requires that session — without it there's no user to
 * call updateUser() against, so bounce back to /login.
 */
export default async function UpdatePasswordPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?error=recovery")
  }

  return <UpdatePasswordForm />
}
