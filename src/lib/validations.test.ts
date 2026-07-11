import { describe, it, expect } from "vitest"
import { MAX_PARTNER_EMAILS, signupSchema } from "@/lib/validations"

const valid = {
  email: "founder@example.com",
  password: "supersecret",
  confirmPassword: "supersecret",
  fullName: "Founder One",
  householdName: "Our Home",
  baseCurrency: "EUR",
  secondaryCurrency: "BRL",
  inviteEmails: ["partner@example.com"],
}

describe("signupSchema", () => {
  it("accepts a fully valid signup", () => {
    expect(signupSchema.safeParse(valid).success).toBe(true)
  })

  it("defaults inviteEmails to an empty array and allows no partners", () => {
    const { inviteEmails: _drop, ...rest } = valid
    const result = signupSchema.safeParse(rest)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.inviteEmails).toEqual([])
  })

  it("treats householdName as optional", () => {
    const { householdName: _drop, ...rest } = valid
    expect(signupSchema.safeParse(rest).success).toBe(true)
  })

  it("rejects an invalid email", () => {
    expect(signupSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false)
  })

  it("rejects a short password", () => {
    expect(signupSchema.safeParse({ ...valid, password: "short", confirmPassword: "short" }).success).toBe(false)
  })

  it("rejects mismatched passwords", () => {
    const result = signupSchema.safeParse({ ...valid, confirmPassword: "different" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("confirmPassword"))).toBe(true)
    }
  })

  it("rejects a non 3-letter currency code", () => {
    expect(signupSchema.safeParse({ ...valid, baseCurrency: "EU" }).success).toBe(false)
    expect(signupSchema.safeParse({ ...valid, baseCurrency: "eur" }).success).toBe(false)
  })

  it("rejects equal base and secondary currencies", () => {
    const result = signupSchema.safeParse({ ...valid, secondaryCurrency: "EUR" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("secondaryCurrency"))).toBe(true)
    }
  })

  it("rejects an invalid partner email", () => {
    expect(signupSchema.safeParse({ ...valid, inviteEmails: ["bad"] }).success).toBe(false)
  })

  it("rejects a partner email equal to the founder's own email", () => {
    const result = signupSchema.safeParse({
      ...valid,
      inviteEmails: ["Founder@Example.com"],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("inviteEmails"))).toBe(true)
    }
  })

  it("requires a non-empty full name", () => {
    expect(signupSchema.safeParse({ ...valid, fullName: "  " }).success).toBe(false)
  })

  it("accepts up to MAX_PARTNER_EMAILS partner emails and rejects one more", () => {
    const emails = (n: number) =>
      Array.from({ length: n }, (_, i) => `partner${i}@example.com`)
    expect(
      signupSchema.safeParse({ ...valid, inviteEmails: emails(MAX_PARTNER_EMAILS) }).success
    ).toBe(true)
    const result = signupSchema.safeParse({
      ...valid,
      inviteEmails: emails(MAX_PARTNER_EMAILS + 1),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("inviteEmails"))).toBe(true)
    }
  })
})
