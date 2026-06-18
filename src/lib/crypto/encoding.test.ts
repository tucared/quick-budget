import { describe, it, expect } from "vitest"
import {
  canonicalJson,
  decodeUtf8,
  encodeUtf8,
  fromBase64,
  toBase64,
} from "@/lib/crypto/encoding"

describe("utf8 + base64 round-trips", () => {
  it("round-trips ASCII through utf8", () => {
    expect(decodeUtf8(encodeUtf8("hello world"))).toBe("hello world")
  })

  it("round-trips multi-byte unicode", () => {
    const s = "café — 日本語 — €30,00 🧾"
    expect(decodeUtf8(encodeUtf8(s))).toBe(s)
  })

  it("round-trips arbitrary bytes through base64", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes))
  })

  it("round-trips the empty buffer", () => {
    expect(toBase64(new Uint8Array(0))).toBe("")
    expect(fromBase64("").length).toBe(0)
  })
})

describe("canonicalJson", () => {
  it("is independent of key insertion order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }))
  })

  it("sorts nested object keys recursively", () => {
    expect(canonicalJson({ z: { y: 1, x: 2 } })).toBe('{"z":{"x":2,"y":1}}')
  })

  it("preserves array order (not sorted)", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]")
  })
})
