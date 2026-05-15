import { z } from "zod"

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
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),

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

// Cap-with-overflow split parameters (JTBD #8). The form layer enforces
// `cap_amount < total_amount` and that overflow_category_id differs from the
// primary; this schema only validates the raw shape.
export const splitSchema = z.object({
  cap_amount: z.number().positive("Cap must be greater than 0"),
  overflow_category_id: z.string().uuid("Invalid overflow category"),
})

export type SplitFormValues = z.infer<typeof splitSchema>
