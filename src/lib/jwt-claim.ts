/**
 * Client-only UI hint: read a string claim from a JWT payload without
 * verifying the signature.
 *
 * This helper is used exclusively by `useUser` (client hook) to bootstrap
 * the UI from a session cookie without a round-trip. The server has its own
 * verified path via `src/lib/server/jwt-verify.ts` (`verifyAccessToken`),
 * which checks the JWKS signature before trusting any claim.
 *
 * A tampered cookie can mislabel client UI for one render, but every data
 * call goes through PostgREST which re-verifies the JWT, and RLS gates by
 * the verified `auth.jwt()` context — so no data leaks through this path.
 *
 * Returns null when the token is malformed, the path doesn't exist, or the
 * value isn't a string.
 */
export function decodeJwtClaim(
  token: string | null | undefined,
  path: readonly string[]
): string | null {
  if (!token) return null
  try {
    const payload = token.split(".")[1]
    if (!payload) return null

    const standard = (payload + "===".slice((payload.length + 3) % 4))
      .replace(/-/g, "+")
      .replace(/_/g, "/")
    const json = typeof atob === "function"
      ? atob(standard)
      : Buffer.from(standard, "base64").toString("utf-8")

    let current: unknown = JSON.parse(json)
    for (const key of path) {
      if (typeof current !== "object" || current === null) return null
      current = (current as Record<string, unknown>)[key]
    }
    return typeof current === "string" ? current : null
  } catch {
    return null
  }
}
