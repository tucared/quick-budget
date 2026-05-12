import { describe, it, expect } from "vitest"
import {
  getBudgetProgressBarColor,
  getBudgetStatusColor,
  getBudgetStatusLabel,
  getBudgetStatusTheme,
} from "@/lib/budget-utils"

describe("getBudgetStatusLabel — threshold boundaries", () => {
  describe("on_track", () => {
    it("0% → On track", () => {
      expect(getBudgetStatusLabel(0)).toBe("On track")
    })

    it("50% → On track", () => {
      expect(getBudgetStatusLabel(50)).toBe("On track")
    })

    it("74.99% → On track (just below warning threshold)", () => {
      expect(getBudgetStatusLabel(74.99)).toBe("On track")
    })
  })

  describe("warning", () => {
    it("exactly 75% → Almost there", () => {
      expect(getBudgetStatusLabel(75)).toBe("Almost there")
    })

    it("94.99% → Almost there (just below critical)", () => {
      expect(getBudgetStatusLabel(94.99)).toBe("Almost there")
    })
  })

  describe("critical", () => {
    it("exactly 95% → Nearly exhausted", () => {
      expect(getBudgetStatusLabel(95)).toBe("Nearly exhausted")
    })

    it("99.99% → Nearly exhausted (just below over)", () => {
      expect(getBudgetStatusLabel(99.99)).toBe("Nearly exhausted")
    })
  })

  describe("over", () => {
    it("exactly 100% → Overspent", () => {
      expect(getBudgetStatusLabel(100)).toBe("Overspent")
    })

    it("150% → Overspent", () => {
      expect(getBudgetStatusLabel(150)).toBe("Overspent")
    })
  })
})

describe("getBudgetStatusLabel — fully_used short-circuit", () => {
  it("remainingAmount = 0 → Fully used", () => {
    expect(getBudgetStatusLabel(100, undefined, undefined, 0)).toBe("Fully used")
  })

  it("remainingAmount = 0.004 (under 0.005 threshold) → Fully used", () => {
    expect(getBudgetStatusLabel(99, undefined, undefined, 0.004)).toBe("Fully used")
  })

  it("remainingAmount = -0.004 (negative, under threshold magnitude) → Fully used", () => {
    expect(getBudgetStatusLabel(101, undefined, undefined, -0.004)).toBe("Fully used")
  })

  it("remainingAmount = 0.005 (boundary, NOT under) → falls through to percent-based status", () => {
    expect(getBudgetStatusLabel(100, undefined, undefined, 0.005)).toBe("Overspent")
  })

  it("wins over 'over' when both apply (percentSpent=120, remaining=0)", () => {
    expect(getBudgetStatusLabel(120, undefined, undefined, 0)).toBe("Fully used")
  })

  it("remainingAmount = null/undefined → does not short-circuit", () => {
    expect(getBudgetStatusLabel(100, undefined, undefined, undefined)).toBe("Overspent")
  })
})

describe("getBudgetStatusLabel — ahead (day-of-month pace)", () => {
  it("requires BOTH dayOfMonth and daysInMonth (only dayOfMonth → no ahead)", () => {
    expect(getBudgetStatusLabel(80, 10, undefined)).toBe("Almost there")
  })

  it("requires BOTH dayOfMonth and daysInMonth (only daysInMonth → no ahead)", () => {
    expect(getBudgetStatusLabel(80, undefined, 30)).toBe("Almost there")
  })

  it("day 10 of 30, percentSpent=35 → On track (below 36.66 threshold)", () => {
    // ideal=33.33%, threshold=ideal*1.1=36.66%
    expect(getBudgetStatusLabel(35, 10, 30)).toBe("On track")
  })

  it("day 10 of 30, percentSpent=40 → Above pace (above 36.66 threshold)", () => {
    expect(getBudgetStatusLabel(40, 10, 30)).toBe("Above pace")
  })

  it("ahead can override warning (pace beats 75% threshold)", () => {
    // day 5 of 30, ideal=16.66%, threshold=18.33%, percentSpent=80 → ahead
    expect(getBudgetStatusLabel(80, 5, 30)).toBe("Above pace")
  })

  it("critical takes precedence over ahead (percentSpent=96 with ahead-triggering day args)", () => {
    expect(getBudgetStatusLabel(96, 5, 30)).toBe("Nearly exhausted")
  })

  it("over takes precedence over ahead (percentSpent=120 with ahead-triggering day args)", () => {
    expect(getBudgetStatusLabel(120, 5, 30)).toBe("Overspent")
  })
})

describe("status helpers stay consistent with label", () => {
  it("getBudgetStatusColor returns a text-* class", () => {
    expect(getBudgetStatusColor(80)).toMatch(/^text-/)
  })

  it("getBudgetProgressBarColor returns a bg-* class", () => {
    expect(getBudgetProgressBarColor(80)).toMatch(/^bg-/)
  })

  it("getBudgetStatusTheme returns the full theme shape", () => {
    const theme = getBudgetStatusTheme(80)
    expect(theme).toEqual(
      expect.objectContaining({
        bg: expect.stringMatching(/^bg-/),
        border: expect.stringMatching(/^border-/),
        text: expect.stringMatching(/^text-/),
        indicator: expect.stringMatching(/^bg-/),
      })
    )
  })
})
