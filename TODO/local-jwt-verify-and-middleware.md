# Local JWT verification + wire middleware

Bundles three follow-ups from [PR #108](https://github.com/tucared/quick-budget/pull/108):

- **#1** — Drop the supabase-js SSR adapter's `getUser()` round trip to `/auth/v1/user` on every page load.
- **#5** — Address the `Using the user object as returned from supabase.auth.getSession() … could be insecure` warning (pre-existing pattern, made more visible by #108).
- **#6** — Wire `src/proxy.ts` as an actual `src/middleware.ts` so tokens refresh on navigation and stale-session edge cases get handled centrally.

All three converge on the same change: verify the access-token signature **locally** instead of asking the Supabase auth server to validate it. Once that exists, the middleware hot path is cheap and #5 falls out of dropping the unverified `session.user` read.

## Why this isn't in PR #108's follow-up PR

The original plan was to use the legacy symmetric `SUPABASE_JWT_SECRET` (HS256). Decision: use Supabase's **new asymmetric signing keys** (ES256/RS256 + JWKS) instead. That's the documented forward path ([Supabase: signing keys](https://supabase.com/docs/guides/auth/signing-keys)) — no per-env secret to set, no secret-rotation flapping for users, public key rotates transparently. Worth doing in a focused session, not bundled with unrelated DB + region changes.

## Shape of the work

### Pre-flight (manual, dashboard)

1. In Supabase dashboard for **both Dev and Prod**: rotate the JWT secret from legacy HS256 to an asymmetric signing key (ES256 or RS256). The dashboard exposes the active public key at `<project>/auth/v1/.well-known/jwks.json` once switched.
2. No env var change needed — verification uses the public key fetched at runtime.

### Implementation

**1. Add `jose` dep.**

```bash
npm install jose
```

`jose` is Web-Crypto only, so it works in the Edge runtime that Next.js middleware uses.

**2. New file: `src/lib/server/jwt-verify.ts`.**

```ts
import { jwtVerify, createRemoteJWKSet, errors as joseErrors } from "jose"
import "server-only"

const JWKS_URL = new URL(
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`
)
const jwks = createRemoteJWKSet(JWKS_URL, {
  // jose caches JWKS in-process; tune if needed
  cacheMaxAge: 10 * 60 * 1000, // 10 min
  cooldownDuration: 30 * 1000,
})

export type VerifyResult =
  | { ok: true; claims: SupabaseAccessTokenClaims }
  | { ok: false; reason: "missing" | "expired" | "invalid" }

export type SupabaseAccessTokenClaims = {
  sub: string
  email?: string
  role: "authenticated" | "anon"
  aud: string
  exp: number
  iat: number
  iss: string
  session_id: string
  is_anonymous: boolean
  app_metadata: { household_id?: string; provider?: string; [k: string]: unknown }
  user_metadata: { full_name?: string; [k: string]: unknown }
}

export async function verifyAccessToken(
  token: string | null | undefined
): Promise<VerifyResult> {
  if (!token) return { ok: false, reason: "missing" }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      audience: "authenticated",
      clockTolerance: 5,
    })
    return { ok: true, claims: payload as unknown as SupabaseAccessTokenClaims }
  } catch (e) {
    if (e instanceof joseErrors.JWTExpired) return { ok: false, reason: "expired" }
    return { ok: false, reason: "invalid" }
  }
}
```

Notes:
- `"server-only"` is the build-time fence. Stops a "use client" file accidentally pulling this in.
- JWKS is fetched lazily and cached in-process; cold start fetches once, every subsequent verify is local.
- Algorithm allowlist is implicit via the JWKS key types (`alg` in the JWK).

**3. Companion tests: `src/lib/server/jwt-verify.test.ts`.**

Cover: valid token, expired token (set `exp` in past), bad signature (sign with a key not in JWKS), missing token. Use `jose.SignJWT` to mint test tokens; mock `createRemoteJWKSet` or run against a local fixture key.

**4. Refactor `getServerUser` in `src/lib/server/data.ts`.**

Replace the current `getSession()`-then-decode pattern with `getSession()`-then-verify. Pull `id`/`email`/`fullName` from verified claims (`sub`, `email`, `user_metadata.full_name`), not from `session.user`. That removes the `session.user`-insecure warning automatically.

**5. Refactor `useUser` in `src/lib/hooks/use-user.ts`.**

Client can't import `server-only`. Two viable options:

- **(a) Keep `decodeJwtClaim` unverified** (current pattern) — claim is used only as a UI hint and RLS gates all real data access. A tampered cookie can mislabel UI but can't leak data. **Recommended** — simplest.
- (b) Verify via a small `/api/auth/verify` route. Adds a network call per render. Skip.

Worth dropping the `public.users` fallback path here too (already done in the #4 commit, but verify after rebasing).

**6. Wire middleware: rename `src/proxy.ts` → `src/middleware.ts`.**

```ts
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

  const { data: { session } } = await supabase.auth.getSession()  // cookie read, no network
  if (!session) return supabaseResponse

  const verdict = await verifyAccessToken(session.access_token)

  if (verdict.ok) return supabaseResponse  // hot path — zero network

  if (verdict.reason === "expired") {
    await supabase.auth.refreshSession()  // single /token POST on expiry
    return supabaseResponse
  }

  // 'invalid' — bad signature or claim
  await supabase.auth.signOut()
  if (!PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }
  return supabaseResponse
}
```

Keep the cookie-sync `setAll` pattern from the current `proxy.ts` verbatim.

## Risks

- **JWKS fetch on cold start.** The first request to a fresh function instance fetches `/auth/v1/.well-known/jwks.json`. After that, in-process cache covers everything until rotation. Acceptable.
- **Key rotation.** When Supabase rotates the signing key, `jose` re-fetches JWKS (cooldown gate prevents thundering herd). In-flight tokens signed with the old key remain verifiable until the JWKS endpoint stops listing the old key. Refresh tokens are opaque and unaffected. Graceful.
- **Edge runtime constraints.** `jose` is fine. Do not import anything from `src/lib/server/data.ts` (uses `next/headers`) into `middleware.ts` — keep `src/lib/server/jwt-verify.ts` Node-API-free.
- **Test suite.** `src/lib/server/data.test.ts` (if it exists) and `src/lib/hooks/use-user` tests may stub `getSession` against the old flow. Re-check after the refactor.

## Verification

Local (`http://localhost:3000` — Dev Supabase, **not** the Vercel preview URL, per `CLAUDE.md`):
1. Lint/typecheck/test green.
2. Log in. Network tab: no `GET /auth/v1/user` after login. No `/rest/v1/users` (already true post-#4).
3. Tamper a cookie value → next navigation lands on `/login` via the middleware `signOut` + redirect path.
4. Wait for access-token expiry (default 1h) and navigate → middleware silently refreshes via a single `/token` POST.

## Estimated impact

PR #108 measured ~734 ms from token POST → first data fetch. The remaining `/auth/v1/user` round trip is ~150-250 ms × Vercel→Supabase RTT. Expect another -20% to -30% on warm pages after this lands, and a much cleaner story for stale-session edge cases.
