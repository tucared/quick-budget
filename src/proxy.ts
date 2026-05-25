import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { verifyAccessToken } from "@/lib/server/jwt-verify"

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}

const PROTECTED_PATHS = new Set(["/expenses", "/budget"])

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

  // getSession is a cookie read, no network — fine here; verify step gates trust.
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Resolve a single authoritative auth verdict, mirroring getServerUser:
  // a session is only "authed" if its token verifies AND carries household_id.
  let authed = false
  if (session) {
    let verdict = await verifyAccessToken(session.access_token)

    if (!verdict.ok && verdict.reason === "expired") {
      // single /token POST on expiry, then re-verify the refreshed token
      const { data } = await supabase.auth.refreshSession()
      if (data.session) {
        verdict = await verifyAccessToken(data.session.access_token)
      }
    }

    if (verdict.ok) {
      authed = Boolean(verdict.claims.app_metadata?.household_id)
    } else if (verdict.reason === "transient") {
      // JWKS fetch / Supabase auth outage. Don't sign out: real sessions are
      // still real, just unverifiable right now. Let the request through; the
      // page-level guard re-verifies once the JWKS cache cooldown (30s) clears.
      authed = true
    } else {
      // "invalid" — tampered cookie or malformed token
      await supabase.auth.signOut()
    }
  }

  // Edge auth routing for the known page paths. Other paths (e.g. API routes)
  // fall through untouched, preserving any refreshed cookies on supabaseResponse.
  const { pathname } = request.nextUrl
  let target: string | null = null
  if (pathname === "/") {
    target = authed ? "/expenses" : "/login"
  } else if (pathname === "/login" && authed) {
    target = "/expenses"
  } else if (PROTECTED_PATHS.has(pathname) && !authed) {
    target = "/login"
  }

  if (target) {
    const url = request.nextUrl.clone()
    url.pathname = target
    const redirectResponse = NextResponse.redirect(url)
    // Carry over any session refresh that happened in this hop.
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => redirectResponse.cookies.set(cookie))
    return redirectResponse
  }

  return supabaseResponse
}
