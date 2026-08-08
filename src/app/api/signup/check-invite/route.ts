import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase"
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit"

// Called pre-auth from the /signup form as the visitor types their email, so
// there's no user id to key on — rate-limit by IP instead. 10/min is enough
// for a debounced input on one form field, not enough to make scraping the
// public.check_pending_invite RPC (see supabase/schemas/05_rpcs.sql) practical.
const rateLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /api/signup/check-invite { email } -> { invited: boolean }
//
// Backs the live "you've been invited" detection on /signup: collapses the
// household-setup fields instead of showing them greyed out with a static
// disclaimer. Fails open (invited: false) on any error — a network hiccup or
// rate limit here should never block someone from filling out the form.
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const limited = rateLimitResponse(rateLimiter, ip)
  if (limited) return limited

  try {
    const body = await request.json()
    const email = typeof body?.email === "string" ? body.email.trim() : ""

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ invited: false })
    }

    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.rpc("check_pending_invite", {
      check_email: email,
    })

    if (error) {
      console.error("check_pending_invite failed:", error)
      return NextResponse.json({ invited: false })
    }

    return NextResponse.json({ invited: data === true })
  } catch (_err) {
    return NextResponse.json({ invited: false })
  }
}
