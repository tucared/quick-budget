import { describe, it, expect } from "vitest"
import { adjustToWorkingDay } from "@/lib/exchange-rate-api"

describe("adjustToWorkingDay", () => {
  it("passes weekdays through unchanged", () => {
    expect(adjustToWorkingDay("2026-06-01")).toBe("2026-06-01") // Monday
    expect(adjustToWorkingDay("2026-06-03")).toBe("2026-06-03") // Wednesday
    expect(adjustToWorkingDay("2026-06-05")).toBe("2026-06-05") // Friday
  })

  it("moves Saturday back to Friday", () => {
    expect(adjustToWorkingDay("2026-06-06")).toBe("2026-06-05")
  })

  it("moves Sunday back to Friday", () => {
    expect(adjustToWorkingDay("2026-06-07")).toBe("2026-06-05")
  })

  it("crosses a month boundary (Sun 2026-03-01 → Fri 2026-02-27)", () => {
    expect(adjustToWorkingDay("2026-03-01")).toBe("2026-02-27")
  })

  it("crosses a month boundary from Saturday (Sat 2026-02-28 → Fri 2026-02-27)", () => {
    expect(adjustToWorkingDay("2026-02-28")).toBe("2026-02-27")
  })

  it("crosses a year boundary (Sun 2023-01-01 → Fri 2022-12-30)", () => {
    expect(adjustToWorkingDay("2023-01-01")).toBe("2022-12-30")
  })
})
