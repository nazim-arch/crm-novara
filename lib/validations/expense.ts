import { z } from "zod";

export const EXPENSE_CATEGORIES = [
  "Meta Ads",
  "Google Ads",
  "Ads",
  "Marketing",
  "Site Visits",
  "Travel / Petrol",
  "Shared Commission",
  "Operational Expense",
  "Miscellaneous",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const createExpenseSchema = z.object({
  expense_date: z.string().min(1, "Expense date is required"),
  category: z.string().min(1, "Category is required"),
  amount: z.coerce
    .number({ message: "Amount is required" })
    .positive("Amount must be greater than 0"),
  description: z.string().optional().or(z.literal("")),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
