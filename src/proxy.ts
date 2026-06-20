import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { verifyAccessToken } from "@/lib/server/jwt-verify"

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}

// /auth/callback and /auth/update-password must be reachable WITHOUT a session:
// a user recovering access has none until the callback exchanges the email
// link's code for one. /auth/update-password additionally guards itself in its
// server component (redirects to /login when getUser() is empty). /signup is the
// self-service household-creation entry point — reachable with no session; its
// server component redirects an already-authenticated user to /expenses.
const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/auth/callback",
  "/auth/update-password",
])

// Default-deny for anything not in PUBLIC_PATHS: pages bounce to /login, API
// routes get a JSON 401 (a redirect would confuse fetch callers). Per-route
// auth checks (getServerUser, verifyAccessToken in the API routes) stay as
// defense-in-depth, but a future route added without one is no longer public.
function deny(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const url = request.nextUrl.clone()
  url.pathname = "/login"
  return NextResponse.redirect(url)
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const isPublic = PUBLIC_PATHS.has(request.nextUrl.pathname)

  // getSession is a cookie read, no network — fine here; verify step gates trust.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return isPublic ? supabaseResponse : deny(request)

  const verdict = await verifyAccessToken(session.access_token)
  if (verdict.ok) return supabaseResponse // hot path — zero network

  if (verdict.reason === "expired") {
    // Single /token POST on expiry. A failed refresh means the session is
    // genuinely gone (revoked, refresh token expired) — treat like no session.
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data.session) {
      return isPublic ? supabaseResponse : deny(request)
    }
    return supabaseResponse
  }

  // "transient" — JWKS fetch / Supabase auth outage. Don't sign out: real
  // sessions are still real, just unverifiable right now. Let the request
  // through (pages still render nothing useful — getServerUser also treats
  // transient as unauthenticated); the next navigation re-tries once the
  // JWKS cache cooldown (30s) clears.
  if (verdict.reason === "transient") return supabaseResponse

  // "invalid" — tampered cookie or malformed token
  await supabase.auth.signOut()
  return isPublic ? supabaseResponse : deny(request)
}
