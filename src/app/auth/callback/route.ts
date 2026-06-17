import { NextRequest, NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { createServerSupabaseClient } from "@/lib/supabase"

/**
 * GET /auth/callback
 *
 * Lands here from a Supabase recovery/confirmation email link. Exchanges the
 * link's credential for a session (setting auth cookies via the next/headers
 * adapter — route handlers can write cookies), then forwards to `next`.
 *
 * Handles both email-template shapes so it works regardless of how the project
 * formats links:
 *   - PKCE:       ?code=...            → exchangeCodeForSession
 *   - token hash: ?token_hash=&type=  → verifyOtp
 *
 * On any failure the user is bounced to /login with a recovery error flag.
 * There is no middleware, so this route is reachable without an existing
 * session (which is the whole point — the user is recovering access).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null

  // Only allow internal redirect targets — never reflect an absolute URL.
  const nextParam = searchParams.get("next")
  const next = nextParam && nextParam.startsWith("/") ? nextParam : "/expenses"

  const supabase = await createServerSupabaseClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, origin))
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      return NextResponse.redirect(new URL(next, origin))
    }
  }

  return NextResponse.redirect(new URL("/login?error=recovery", origin))
}
