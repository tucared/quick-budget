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
// The founder enters their credentials, the household name + currencies, and
// optionally partner email(s) to pre-authorize. base_currency must differ from
// secondary_currency — they are the two options of the expense form's toggle,
// and the DB enforces it (households_currencies_distinct), so we reject an equal
// pair up front for a clean message.
export const MIN_PASSWORD_LENGTH = 8

// Hard cap on partner invites per signup. Enforced in the form (no extra rows
// past this), here, and by the LIMIT in handle_new_user()'s invite loop —
// raw_user_meta_data is caller-controlled, so the trigger can't trust this
// client-side check alone. Keep the three in sync.
export const MAX_PARTNER_EMAILS = 10

const currencyCode = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code")

export const signupSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email"),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
    confirmPassword: z.string(),
    fullName: z.string().trim().min(1, "Name is required"),
    householdName: z.string().trim().max(100, "Household name is too long").optional(),
    baseCurrency: currencyCode,
    secondaryCurrency: currencyCode,
    // Optional partner emails. Blanks are dropped before validation by the form.
    inviteEmails: z
      .array(z.string().trim().email("Enter a valid email"))
      .max(MAX_PARTNER_EMAILS, `You can invite up to ${MAX_PARTNER_EMAILS} partners`)
      .default([]),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })
  .refine((v) => v.baseCurrency !== v.secondaryCurrency, {
    message: "Base and secondary currency must differ",
    path: ["secondaryCurrency"],
  })
  .refine((v) => !v.inviteEmails.some((e) => e.toLowerCase() === v.email.toLowerCase()), {
    message: "A partner email can't be your own email",
    path: ["inviteEmails"],
  })

export type SignupFormValues = z.infer<typeof signupSchema>
