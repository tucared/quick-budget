# Local JWT verification + wire middleware

## Why

`getServerUser` in `src/lib/server/data.ts:44` trusts an unverified JWT for the SSR render:

1. `supabase.auth.getSession()` (line 49) reads cookies only — no signature check.
2. `decodeJwtClaim` (`src/lib/jwt-claim.ts:15-40`) decodes the access token via base64 alone; its own docstring states "no signature verification".
3. The result (`id`, `email`, `fullName`, `householdId`) is passed from `src/app/(app)/layout.tsx:5` into `<AppLayoutClient initialUser={…}>` and hydrated into the client React tree.

**Threat:** a forged session cookie reaches the rendered HTML with attacker-supplied identifiers. RLS still blocks data (PostgREST verifies the JWT signature on every request), but URL-bound `householdId` and any React state derived from `initialUser` is poisoned. `src/proxy.ts` already calls `getUser()` (validated), but it is **not wired as middleware** — there is no `src/middleware.ts`, so that call never runs today.

This TODO bundles three follow-ups from [PR #108](https://github.com/tucared/quick-budget/pull/108):

- **Perf** — drop the supabase-js SSR adapter's `getUser()` round trip to `/auth/v1/user` on every page load.
- **Security** — eliminate the unverified-claim read flagged above (the "Using the user object as returned from `supabase.auth.getSession()` could be insecure" warning is the supabase-js surface of the same issue).
- **Plumbing** — wire `src/proxy.ts` as `src/middleware.ts` so tokens refresh on navigation and invalid sessions get cleaned up centrally instead of leaking into the layout.

All three converge on one change: verify the access-token signature **locally** rather than asking the Supabase auth server. The simpler stop-gap (replace `getSession()` with `getUser()` inside `getServerUser`) closes the security hole but costs ~150-250 ms `/auth/v1/user` per SSR render — `cache()` only dedupes within a single request, so every navigation pays it. Local JWKS verification is secure *and* keeps the hot path network-free.

### Why asymmetric (JWKS), not symmetric (`SUPABASE_JWT_SECRET`)

Supabase's newer asymmetric signing keys (ES256/RS256) are the documented forward path ([signing keys guide](https://supabase.com/docs/guides/auth/signing-keys)). The public key is exposed at `<project>/auth/v1/.well-known/jwks.json`, fetched once at cold start and cached in-process by `jose`. No per-env secret to set in Vercel, no secret-rotation flapping, public key rotates transparently.

## Files touched

| Path | Change |
|------|--------|
| `package.json` / `package-lock.json` | add `jose` |
| `src/lib/server/jwt-verify.ts` | **new** — `verifyAccessToken()` against JWKS |
| `src/lib/server/jwt-verify.test.ts` | **new** — unit tests (valid / expired / bad-sig / missing) |
| `src/lib/server/data.ts` | `getServerUser` reads from verified claims, not `session.user` |
| `src/lib/jwt-claim.ts` | retitle docstring → "client-only UI hint" (function body unchanged) |
| `src/lib/hooks/use-user.ts` | no code change — comment that the unverified read is intentional UI hint |
| `src/proxy.ts` → `src/middleware.ts` | rename + add verify-and-redirect logic |
| `supabase/config.toml` | uncomment `signing_keys_path` for local-dev parity |
| `.gitignore` | add the local signing-key file |

**Out of scope:** `src/app/api/exchange-rates/route.ts:64` keeps its `supabase.auth.getUser()` call. That route is a real API endpoint (rate fetch), not SSR — one validated network call per request is fine and not worth refactoring for parity. Calling it out so the desktop session doesn't re-litigate.

## Pre-flight (manual)

These are the steps a human runs before the first commit lands. They are reversible (see Rollback).

1. **Supabase Dev dashboard.** Authentication → Signing Keys → rotate the active key from legacy HMAC to a new asymmetric key (pick ES256 — smaller tokens than RS256). The legacy HMAC key stays available during the transition; existing sessions remain verifiable until they expire. Verify `https://<dev-project>.supabase.co/auth/v1/.well-known/jwks.json` returns the new public key.
2. **Supabase Prod dashboard.** Same as step 1 against the Prod project. Do this *after* the Dev cutover has been smoke-tested end-to-end.
3. **Local dev parity.** Local Supabase (`supabase start`) signs HS256 by default — `jose` cannot verify HS256 via a JWKS endpoint. Bring the local stack up to parity:
   - Generate an ES256 key pair (`openssl ecparam -name P-256 -genkey -noout -out signing_keys.key`, then derive the JWK JSON — Supabase docs have the exact script).
   - Save the JWK file at the repo root (filename `signing_keys.json`).
   - In `supabase/config.toml:158-159`, uncomment `signing_keys_path = "./signing_keys.json"`.
   - Add `signing_keys.json` to `.gitignore` (the file is a local-only dev secret; do **not** commit).
   - `supabase stop && supabase start` to pick up the new config. Confirm `http://127.0.0.1:54321/auth/v1/.well-known/jwks.json` returns the public key.
   - Document the bootstrap step in `README.md` under "Quick Start" so a fresh clone doesn't break.

## Implementation

### 1. Add the `jose` dep

```bash
npm install jose
```

`jose` is Web-Crypto only, so it works in the Edge runtime that Next.js middleware runs on.

### 2. New file: `src/lib/server/jwt-verify.ts`

```ts
import "server-only"
import { jwtVerify, createRemoteJWKSet, errors as joseErrors } from "jose"

const JWKS_URL = new URL(
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`
)
const jwks = createRemoteJWKSet(JWKS_URL, {
  cacheMaxAge: 10 * 60 * 1000, // 10 min — refetch after rotation lag window
  cooldownDuration: 30 * 1000,  // prevent thundering herd on miss
})

export type SupabaseAccessTokenClaims = {
  sub: string
  email?: string
  role: "authenticated" | "anon"
  aud: string
  exp: number
  iat: number
  iss: string
  session_id: string
  is_anonymous?: boolean
  app_metadata: { household_id?: string; provider?: string; [k: string]: unknown }
  user_metadata: { full_name?: string; [k: string]: unknown }
}

export type VerifyResult =
  | { ok: true; claims: SupabaseAccessTokenClaims }
  | { ok: false; reason: "missing" | "expired" | "invalid" }

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
- `"server-only"` is a build-time fence — a `"use client"` file accidentally importing this will fail the build.
- JWKS is fetched lazily on first call and cached in-process; cold start fetches once, subsequent verifies are local.
- Algorithm allowlist is implicit via the JWKS key types (`alg` from each JWK).
- **JWKS fetch failure mode is deliberate.** Network blip, Supabase auth down, or rotation transient → `jose` throws → `verifyAccessToken` returns `{ ok: false, reason: "invalid" }` → middleware signs out and redirects to `/login`. Users see a brief re-auth instead of a crash. Acceptable.

### 3. Tests: `src/lib/server/jwt-verify.test.ts`

Cover:
- Valid token — assert `ok: true` and claims shape.
- Expired token (set `exp` in the past) — assert `ok: false, reason: "expired"`.
- Tampered/bad-signature token (sign with a key not in JWKS) — assert `ok: false, reason: "invalid"`.
- Missing token (`null`, `undefined`, `""`) — assert `ok: false, reason: "missing"`.

Use `jose.SignJWT` + a local generated key pair to mint test tokens. Mock `createRemoteJWKSet` with a static local JWKS fixture so the test never hits the network. Co-locate per the repo convention (`*.test.ts` next to source — see `src/lib/jwt-claim.test.ts` as the pattern).

### 4. Refactor `getServerUser` in `src/lib/server/data.ts`

Replace the `getSession()` → `decodeJwtClaim` sequence with `getSession()` → `verifyAccessToken`. Pull `id`/`email`/`fullName`/`householdId` from the verified claims, not from `session.user`. That removes the supabase-js "insecure" warning automatically because `session.user` is no longer the source of truth.

```ts
import { verifyAccessToken } from "@/lib/server/jwt-verify"
// …
export const getServerUser = cache(async (): Promise<UserData | null> => {
  const supabase = await getSupabase()
  const { data: { session } } = await supabase.auth.getSession() // cookie read, no network
  const verdict = await verifyAccessToken(session?.access_token)
  if (!verdict.ok) return null

  const { claims } = verdict
  const householdId = claims.app_metadata?.household_id
  if (!householdId) return null

  return {
    id: claims.sub,
    email: claims.email,
    fullName: claims.user_metadata?.full_name || claims.email?.split("@")[0] || "User",
    householdId,
  }
})
```

Drop the import of `decodeJwtClaim` from this file. Update the docstring to describe the verified flow.

### 5. Update `src/lib/jwt-claim.ts` docstring

The function body stays. Only the docstring (lines 1-14) becomes inaccurate after step 4 — rewrite to make explicit that this helper is **client-only** now, used solely as a UI hint by `useUser`, and the server has its own verified path via `jwt-verify.ts`. Retain the "RLS still gates data" reassurance.

### 6. `src/lib/hooks/use-user.ts` — no behavior change

Lines 3, 27, 47 stay: client imports `decodeJwtClaim`, calls `getSession()`, decodes `household_id` unverified. Rationale (worth a one-line code comment): a tampered cookie can mislabel client UI for one render, but every data call goes through PostgREST which re-verifies the JWT, and RLS gates by the verified `auth.jwt()` context. Verifying client-side would require either shipping JWKS to the browser (fine) or an extra `/api/auth/verify` round trip (not fine). Skip.

### 7. Rename `src/proxy.ts` → `src/middleware.ts`

Next.js looks for `src/middleware.ts` (or `middleware.ts` at the project root) — the current `src/proxy.ts` is never loaded. The new file adds the verify-and-redirect logic on top of the existing cookie-sync.

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

  // getSession is a cookie read, no network — fine here, the verify step gates trust.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return supabaseResponse

  const verdict = await verifyAccessToken(session.access_token)
  if (verdict.ok) return supabaseResponse // hot path — zero network

  if (verdict.reason === "expired") {
    await supabase.auth.refreshSession() // single /token POST on expiry
    return supabaseResponse
  }

  // "invalid" or "missing" — bad signature, tampered cookie, JWKS fetch failure
  await supabase.auth.signOut()
  if (!PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }
  return supabaseResponse
}
```

Keep the cookie-sync `setAll` pattern from the current `proxy.ts` verbatim — it's load-bearing for Supabase session refresh.

### 8. Edge-runtime constraints (rules, not suggestions)

- `src/middleware.ts` runs on the Edge runtime. It **must not** import from `src/lib/server/data.ts` — that file uses `next/headers`, which is Node-only. `next/headers` is the actual fence; `"server-only"` only forbids client imports.
- `src/lib/server/jwt-verify.ts` must stay Node-API-free (no `Buffer`, `crypto` Node bindings, `fs`, etc.). `jose` is Web-Crypto, so it's compatible with both runtimes — keep dependencies that way.

## Verification

Local (`http://localhost:3000` against local Supabase — **not** the Vercel preview URL, per `CLAUDE.md`):

1. `npm run lint && npm run typecheck && npm test` — all green.
2. Log in with `user1@example.com` / `password1`. Open DevTools → Network. Reload a logged-in page: confirm **no** `GET /auth/v1/user` request. Confirm no `/rest/v1/users` (this should already be true).
3. **Tampered-cookie repro.** With DevTools Application → Cookies, edit a single character in the `sb-*-auth-token` cookie value. Next navigation must land on `/login` (middleware `signOut` + redirect path).
4. **Token expiry repro.** Wait until past `exp` (default 1h) or manually edit the cookie's expiry. Next navigation: middleware silently calls `/token` (single POST), page renders fine.
5. Unit tests in `jwt-verify.test.ts` cover the verifier; the middleware redirect is covered manually (Next.js middleware is hard to unit-test cleanly without a harness).

Vercel preview verification (after merge to a preview branch):
- Repeat steps 2-4 against the preview URL.
- Check Vercel function logs for unexpected JWKS fetch failures.

## Rollback

If a deploy breaks auth (e.g., dashboard rotation didn't take effect, JWKS endpoint returning unexpected payload, runtime regression):

1. **Revert the merge commit** (`git revert -m 1 <merge-sha>`) and redeploy. This restores `getServerUser` to the unverified-claim read and removes `src/middleware.ts` — the pre-fix behavior, including the original security gap.
2. **Optionally rotate the dashboard signing key back to HMAC.** Only necessary if asymmetric signing itself is the problem (rare); the unverified-claim code path works with either signing mode, so a code revert alone usually suffices.
3. **User impact during rollback:** anyone whose access token was issued under the asymmetric key will get verified normally for ~1h (until expiry), then refresh transparently. No forced re-login.

## Risks

- **JWKS cold-start fetch.** First request to a fresh function instance fetches `/auth/v1/.well-known/jwks.json`. After that, in-process cache covers everything until rotation. Adds a one-time ~50-100 ms on cold start.
- **Key rotation.** When Supabase rotates the signing key, `jose` re-fetches JWKS (cooldown gate prevents thundering herd). Tokens signed with the previous key remain verifiable until the JWKS endpoint stops listing the old key. Refresh tokens are opaque and unaffected by signing key rotation.
- **Edge runtime constraints.** See "Edge-runtime constraints" above. The biggest footgun is accidentally importing from `src/lib/server/data.ts` into middleware.
- **Local dev requires a pre-flight step.** A fresh clone breaks until `signing_keys.json` is generated. Document in `README.md` "Quick Start" so this isn't a footgun for the next person setting up the repo.
- **Existing test stubs.** Check `src/lib/server/data.test.ts` (and any `useUser` tests) for fixtures that mock the old `getSession()` flow; re-stub against the new verified flow if needed.

## Estimated impact

Two things get faster, one stays the same:

- **Removed:** the supabase-js SSR adapter's `getUser()` call to `/auth/v1/user` on every page load (~150-250 ms server-side, depending on Vercel → Supabase RTT). Net: warm pages render faster, cold pages no longer block on a second auth round-trip after the token POST.
- **Removed:** the fallback `public.users` SELECT in the previous `getServerUser` code path (already gone in earlier work, but cleanly attributed here).
- **Unchanged:** the actual data fetches (`budget_summary`, `expenses`, etc.) and the local `getSession()` cookie read.

The security win — eliminating the forged-cookie SSR-poisoning vector — is the headline. The perf win is a bonus.
