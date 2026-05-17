import "server-only"
import { jwtVerify, createRemoteJWKSet, errors as joseErrors } from "jose"

const JWKS_URL = new URL(
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`
)
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
