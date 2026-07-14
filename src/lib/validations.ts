import { z } from "zod"
import { isValidIsoDate } from "@/lib/date-utils"

// Expense form validation schema
export const expenseSchema = z.object({
  amount: z
    .number({ message: "Amount must be a number" })
    .positive("Amount must be greater than 0")
    .max(9999999999.99, "Amount is too large"),

  category_id: z
    .string({ message: "Category is required" })
    .uuid("Invalid category"),

  is_cash: z.boolean(),

  expense_date: z
    .string({ message: "Date is required" })
    .refine(isValidIsoDate, "Invalid date"),

  description: z
    .string()
    .max(500, "Description is too long")
    .optional(),

  currency: z
    .string()
    .length(3, "Currency must be 3 characters")
    .default("EUR")
    .optional(),
})

export type ExpenseFormValues = z.infer<typeof expenseSchema>

// Signup / create-household form validation schema.
//
// The founder enters their credentials, the currencies, their spending
// categories, and optionally partner email(s) to pre-authorize. (The household
// itself is named by the DB trigger from the founder's email — the form
// doesn't collect a name.) base_currency must differ from secondary_currency —
// they are the two options of the expense form's toggle, and the DB enforces
// it (households_currencies_distinct), so we reject an equal pair up front for
// a clean message.
export const MIN_PASSWORD_LENGTH = 8

// Shared by the signup form (gating the live invite check) and the
// check-invite API route (validating its input) — keep the two in lockstep.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Hard cap on partner invites per signup. Enforced in the form (no extra rows
// past this), here, and by the LIMIT in handle_new_user()'s invite loop —
// raw_user_meta_data is caller-controlled, so the trigger can't trust this
// client-side check alone. Keep the three in sync.
export const MAX_PARTNER_EMAILS = 10

// Hard cap on spending categories per signup. Same triple enforcement as
// MAX_PARTNER_EMAILS: the form, this schema, and the LIMIT in
// handle_new_user()'s category insert. Keep the three in sync.
export const MAX_SIGNUP_CATEGORIES = 20

const currencyCode = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code")

// One founder-chosen spending category. Length caps mirror the trigger's
// clamps (left(name, 40) / left(icon, 16)); 16 chars leaves room for
// multi-code-point ZWJ emoji sequences while still rejecting arbitrary text
// as an icon.
const signupCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the category a name")
    .max(40, "Category name is too long"),
  icon: z
    .string()
    .trim()
    .min(1, "Pick an emoji for the category")
    .max(16, "Icon must be a single emoji"),
})

export type SignupCategory = z.infer<typeof signupCategorySchema>

export const signupSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email"),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
    // Optional — handle_new_user() falls back to "<email name>'s Allowance"
    // when blank. Used verbatim when present (no suffix appended).
    allowanceName: z.string().trim().max(40, "Allowance name is too long").optional(),
    // Founder path only — the form omits this entirely for an invited signup
    // (the household/category sections are hidden), so absent is valid, but a
    // present list needs at least one entry: there is no in-app category
    // management yet, so a household without spending categories is stuck.
    categories: z
      .array(signupCategorySchema)
      .min(1, "Add at least one spending category")
      .max(MAX_SIGNUP_CATEGORIES, `You can add up to ${MAX_SIGNUP_CATEGORIES} categories`)
      .optional(),
    baseCurrency: currencyCode,
    secondaryCurrency: currencyCode,
    // Optional partner emails. Blanks are dropped before validation by the form.
    inviteEmails: z
      .array(z.string().trim().email("Enter a valid email"))
      .max(MAX_PARTNER_EMAILS, `You can invite up to ${MAX_PARTNER_EMAILS} partners`)
      .default([]),
  })
  .refine((v) => v.baseCurrency !== v.secondaryCurrency, {
    message: "Base and secondary currency must differ",
    path: ["secondaryCurrency"],
  })
  .refine((v) => !v.inviteEmails.some((e) => e.toLowerCase() === v.email.toLowerCase()), {
    message: "A partner email can't be your own email",
    path: ["inviteEmails"],
  })
  .refine(
    (v) =>
      !v.categories ||
      new Set(v.categories.map((c) => c.name.toLowerCase())).size === v.categories.length,
    {
      message: "You already have a category with that name",
      path: ["categories"],
    }
  )

export type SignupFormValues = z.infer<typeof signupSchema>
