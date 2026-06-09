import { describe, it, expect } from "vitest"
import { parseTricountToken } from "./client"

describe("parseTricountToken", () => {
  it("extracts the token from a full share URL", () => {
    expect(parseTricountToken("https://tricount.com/tSRhtvSJtYyDukBmBw")).toBe(
      "tSRhtvSJtYyDukBmBw"
    )
  })

  it("handles a trailing slash", () => {
    expect(parseTricountToken("https://tricount.com/tSRhtvSJtYyDukBmBw/")).toBe(
      "tSRhtvSJtYyDukBmBw"
    )
  })

  it("ignores a query string", () => {
    expect(
      parseTricountToken("https://tricount.com/tSRhtvSJtYyDukBmBw?utm_source=share&x=1")
    ).toBe("tSRhtvSJtYyDukBmBw")
  })

  it("handles a scheme-less URL", () => {
    expect(parseTricountToken("tricount.com/tSRhtvSJtYyDukBmBw")).toBe("tSRhtvSJtYyDukBmBw")
  })

  it("accepts a bare token", () => {
    expect(parseTricountToken("tSRhtvSJtYyDukBmBw")).toBe("tSRhtvSJtYyDukBmBw")
  })

  it("trims surrounding whitespace", () => {
    expect(parseTricountToken("  tSRhtvSJtYyDukBmBw \n")).toBe("tSRhtvSJtYyDukBmBw")
    expect(parseTricountToken("\t https://tricount.com/tSRhtvSJtYyDukBmBw  ")).toBe(
      "tSRhtvSJtYyDukBmBw"
    )
  })

  it("returns null for empty or whitespace-only input", () => {
    expect(parseTricountToken("")).toBeNull()
    expect(parseTricountToken("   ")).toBeNull()
  })

  it("returns null for a too-short token", () => {
    expect(parseTricountToken("abc12")).toBeNull()
  })

  it("returns null for a URL with no token path segment", () => {
    expect(parseTricountToken("https://tricount.com/")).toBeNull()
  })

  it("returns null for input that is neither a token nor a URL", () => {
    expect(parseTricountToken("not a url at all!!!")).toBeNull()
    expect(parseTricountToken("abc-def-ghi")).toBeNull()
  })
})
