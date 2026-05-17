import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { verifyAccessToken } from "@/lib/server/jwt-verify"

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}

const PUBLIC_PATHS = new Set(["/login", "/auth/callback"])

export async function middleware(request: NextRequest) {
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
  if (!session) return supabaseResponse

  const verdict = await verifyAccessToken(session.access_token)
  if (verdict.ok) return supabaseResponse // hot path — zero network

  if (verdict.reason === "expired") {
    await supabase.auth.refreshSession() // single /token POST on expiry
    return supabaseResponse
  }

  // "invalid" — tampered cookie or JWKS fetch failure
  await supabase.auth.signOut()
  if (!PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }
  return supabaseResponse
}
