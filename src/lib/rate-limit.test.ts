import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { createRateLimiter } from "@/lib/rate-limit"

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("allows up to maxRequests and counts remaining down", () => {
    const check = createRateLimiter({ maxRequests: 3, windowMs: 60_000 })
    expect(check("u1")).toEqual({ allowed: true, remaining: 2, retryAfterMs: null })
    expect(check("u1")).toEqual({ allowed: true, remaining: 1, retryAfterMs: null })
    expect(check("u1")).toEqual({ allowed: true, remaining: 0, retryAfterMs: null })
  })

  it("blocks the request over the limit", () => {
    const check = createRateLimiter({ maxRequests: 2, windowMs: 60_000 })
    check("u1")
    check("u1")
    const result = check("u1")
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it("computes retryAfterMs from the oldest in-window timestamp", () => {
    const check = createRateLimiter({ maxRequests: 2, windowMs: 1000 })
    check("u1") // t=0
    vi.advanceTimersByTime(300)
    check("u1") // t=300
    vi.advanceTimersByTime(200)
    // t=500: oldest (t=0) expires at t=1000 → retry after 500ms
    expect(check("u1")).toEqual({ allowed: false, remaining: 0, retryAfterMs: 500 })
  })

  it("slides the window: an expired timestamp frees a slot", () => {
    const check = createRateLimiter({ maxRequests: 2, windowMs: 1000 })
    check("u1") // t=0
    vi.advanceTimersByTime(300)
    check("u1") // t=300
    vi.advanceTimersByTime(701)
    // t=1001: the t=0 timestamp fell out of the window
    expect(check("u1").allowed).toBe(true)
    vi.advanceTimersByTime(99)
    // t=1100: window holds [300, 1001] → blocked; t=300 expires at t=1300
    expect(check("u1")).toEqual({ allowed: false, remaining: 0, retryAfterMs: 200 })
  })

  it("resets fully once the whole window has elapsed", () => {
    const check = createRateLimiter({ maxRequests: 2, windowMs: 1000 })
    check("u1")
    check("u1")
    expect(check("u1").allowed).toBe(false)
    vi.advanceTimersByTime(1001)
    expect(check("u1")).toEqual({ allowed: true, remaining: 1, retryAfterMs: null })
  })

  it("tracks keys independently", () => {
    const check = createRateLimiter({ maxRequests: 1, windowMs: 60_000 })
    expect(check("u1").allowed).toBe(true)
    expect(check("u2").allowed).toBe(true)
    expect(check("u1").allowed).toBe(false)
  })

  it("evicts stale keys without affecting their fresh allowance", () => {
    const check = createRateLimiter({ maxRequests: 2, windowMs: 1000 })
    check("stale")
    check("stale")
    // Trigger the lazy cleanup (runs after 2× the window) via another key.
    vi.advanceTimersByTime(2500)
    check("other")
    // Evicted key starts fresh: full quota again.
    expect(check("stale")).toEqual({ allowed: true, remaining: 1, retryAfterMs: null })
    expect(check("stale")).toEqual({ allowed: true, remaining: 0, retryAfterMs: null })
    expect(check("stale").allowed).toBe(false)
  })
})
