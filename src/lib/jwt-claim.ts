/**
 * Read a string claim from a JWT's payload without verifying its signature.
 *
 * The JWT signature is verified upstream — by PostgREST on every API request
 * via the Supabase JWT secret — so reading the claim unverified here is only
 * used as a performance hint (skip a public.users SELECT when the
 * household_id claim is present). RLS still enforces the actual scope server-
 * side using the verified `auth.jwt()` context, so a tampered cookie can't
 * leak another household's data through this path.
 *
 * Returns null when the token is malformed, the path doesn't exist, or the
 * value isn't a string — callers should treat null as "claim absent" and
 * fall back to whatever cold path they have.
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
