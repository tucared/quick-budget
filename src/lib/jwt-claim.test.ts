import { describe, expect, it } from "vitest"
import { decodeJwtClaim } from "./jwt-claim"

function buildJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
  const body = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
  return `${header}.${body}.fake-signature`
}

describe("decodeJwtClaim", () => {
  it("reads a top-level string claim", () => {
    const token = buildJwt({ sub: "user-123" })
    expect(decodeJwtClaim(token, ["sub"])).toBe("user-123")
  })

  it("reads a nested string claim", () => {
    const token = buildJwt({
      app_metadata: { household_id: "house-abc" },
    })
    expect(decodeJwtClaim(token, ["app_metadata", "household_id"])).toBe("house-abc")
  })

  it("returns null when the path doesn't exist", () => {
    const token = buildJwt({ app_metadata: {} })
    expect(decodeJwtClaim(token, ["app_metadata", "household_id"])).toBeNull()
  })

  it("returns null when the value isn't a string", () => {
    const token = buildJwt({ count: 42 })
    expect(decodeJwtClaim(token, ["count"])).toBeNull()
  })

  it("returns null when intermediate node isn't an object", () => {
    const token = buildJwt({ app_metadata: "not-an-object" })
    expect(decodeJwtClaim(token, ["app_metadata", "household_id"])).toBeNull()
  })

  it("returns null for an empty token", () => {
    expect(decodeJwtClaim("", ["sub"])).toBeNull()
    expect(decodeJwtClaim(null, ["sub"])).toBeNull()
    expect(decodeJwtClaim(undefined, ["sub"])).toBeNull()
  })

  it("returns null for a malformed token", () => {
    expect(decodeJwtClaim("not.a.jwt", ["sub"])).toBeNull()
    expect(decodeJwtClaim("missing-segments", ["sub"])).toBeNull()
  })

  it("tolerates base64url payloads that omit padding", () => {
    // Payload {"a":"b"} base64-encoded is "eyJhIjoiYiJ9" which is 12 chars (no padding needed).
    // Try a payload that needs 1 char of padding to round-trip via atob.
    const token = buildJwt({ key: "val" }) // payload length 14, would need '==' padding
    expect(decodeJwtClaim(token, ["key"])).toBe("val")
  })
})
