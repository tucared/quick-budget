import { vi, describe, it, expect, beforeAll } from "vitest"
import { generateKeyPair, SignJWT, errors as joseErrors } from "jose"

// Env var + server-only mock are wired in vitest.setup.ts so module init succeeds.

// Mock createRemoteJWKSet to return a local key resolver instead of fetching a
// URL. verifyKey is set in beforeAll; the inner async function captures it by
// reference, so it resolves to the correct key when tests run. Tests that need
// to simulate JWKS failures override jwksError before calling verifyAccessToken.
let verifyKey: CryptoKey
let jwksError: Error | null = null

vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>()
  return {
    ...actual,
    createRemoteJWKSet: () => async () => {
      if (jwksError) throw jwksError
      return verifyKey
    },
  }
})

import { verifyAccessToken } from "./jwt-verify"

let signingKey: CryptoKey
let wrongSigningKey: CryptoKey

beforeAll(async () => {
  const pair = await generateKeyPair("ES256")
  signingKey = pair.privateKey
  verifyKey = pair.publicKey
  wrongSigningKey = (await generateKeyPair("ES256")).privateKey
})

function baseClaims() {
  return {
    sub: "user-123",
    email: "test@example.com",
    aud: "authenticated",
    role: "authenticated" as const,
    iss: "http://localhost:54321/auth/v1",
    session_id: "sess-abc",
    iat: Math.floor(Date.now() / 1000),
    app_metadata: { household_id: "house-abc" },
    user_metadata: { full_name: "Test User" },
  }
}

async function mintToken(claims: object, key: CryptoKey, expiry = "1h") {
  return new SignJWT(claims as Record<string, unknown>)
    .setProtectedHeader({ alg: "ES256" })
    .setExpirationTime(expiry)
    .sign(key)
}

describe("verifyAccessToken", () => {
  it("returns ok=true with correct claim shape for a valid token", async () => {
    const token = await mintToken(baseClaims(), signingKey)
    const result = await verifyAccessToken(token)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.claims.sub).toBe("user-123")
    expect(result.claims.app_metadata.household_id).toBe("house-abc")
    expect(result.claims.user_metadata.full_name).toBe("Test User")
  })

  it("returns reason=expired for a token past its exp", async () => {
    const token = await mintToken(baseClaims(), signingKey, "-1h")
    expect(await verifyAccessToken(token)).toEqual({ ok: false, reason: "expired" })
  })

  it("returns reason=invalid for a token signed with an unknown key", async () => {
    const token = await mintToken(baseClaims(), wrongSigningKey)
    expect(await verifyAccessToken(token)).toEqual({ ok: false, reason: "invalid" })
  })

  it("returns reason=missing for null, undefined, and empty string", async () => {
    expect(await verifyAccessToken(null)).toEqual({ ok: false, reason: "missing" })
    expect(await verifyAccessToken(undefined)).toEqual({ ok: false, reason: "missing" })
    expect(await verifyAccessToken("")).toEqual({ ok: false, reason: "missing" })
  })

  it("returns reason=transient for a JWKS infrastructure failure", async () => {
    const token = await mintToken(baseClaims(), signingKey)
    jwksError = new joseErrors.JWKSTimeout()
    try {
      expect(await verifyAccessToken(token)).toEqual({ ok: false, reason: "transient" })
    } finally {
      jwksError = null
    }
  })

  it("returns reason=transient for a raw network error", async () => {
    const token = await mintToken(baseClaims(), signingKey)
    jwksError = new TypeError("fetch failed")
    try {
      expect(await verifyAccessToken(token)).toEqual({ ok: false, reason: "transient" })
    } finally {
      jwksError = null
    }
  })
})
