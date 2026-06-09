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
