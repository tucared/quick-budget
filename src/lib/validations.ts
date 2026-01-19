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

  account_id: z
    .string({ message: "Account is required" })
    .uuid("Invalid account"),

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
