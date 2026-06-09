import "server-only"
import { jwtVerify, createRemoteJWKSet, errors as joseErrors } from "jose"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!supabaseUrl) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL is required for JWT verification. " +
      "Set it in .env.local (local), Vercel project settings (deployed), or CI secrets."
  )
}
const JWKS_URL = new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)
const jwks = createRemoteJWKSet(JWKS_URL, {
  cacheMaxAge: 10 * 60 * 1000,
  cooldownDuration: 30 * 1000,
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
  | { ok: false; reason: "missing" | "expired" | "invalid" | "transient" }

export async function verifyAccessToken(
  token: string | null | undefined
): Promise<VerifyResult> {
  if (!token) return { ok: false, reason: "missing" }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      audience: "authenticated",
      // Defense-in-depth: the JWKS is project-bound so a foreign project's
      // token can't pass signature verification anyway, but pin the issuer
      // against future key-reuse or multi-project mistakes.
      issuer: `${supabaseUrl}/auth/v1`,
      clockTolerance: 5,
    })
    return { ok: true, claims: payload as unknown as SupabaseAccessTokenClaims }
  } catch (e) {
    if (e instanceof joseErrors.JWTExpired) return { ok: false, reason: "expired" }
    // Infrastructure failures (network blip, JWKS endpoint down, rotation lag)
    // surface as transient so middleware can let real sessions through during
    // a Supabase outage instead of mass-logging-out every user. Anything from
    // outside jose's typed error hierarchy (raw fetch/TCP/DNS errors) lands
    // here too — those are also transient by nature.
    if (
      e instanceof joseErrors.JWKSTimeout ||
      e instanceof joseErrors.JWKSInvalid ||
      e instanceof joseErrors.JWKSNoMatchingKey ||
      !(e instanceof joseErrors.JOSEError)
    ) {
      return { ok: false, reason: "transient" }
    }
    return { ok: false, reason: "invalid" }
  }
}
