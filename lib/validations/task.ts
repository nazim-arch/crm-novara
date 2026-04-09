import { z } from "zod";

const taskBaseSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().optional().or(z.literal("")),
  assigned_to_id: z.string().min(1, "Assignee is required"),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).default("Medium"),
  due_date: z.coerce.date(),
  start_date: z.coerce.date().optional(),
  sector: z.string().optional().or(z.literal("")),
  lead_id: z.string().optional(),
  opportunity_id: z.string().optional(),
  revenue_tagged: z.boolean().default(false),
  revenue_amount: z.coerce.number().positive().optional(),
  notes: z.string().optional().or(z.literal("")),
  checklist: z
    .array(z.object({ text: z.string(), done: z.boolean() }))
    .optional(),
  recurrence: z
    .enum(["None", "Daily", "Weekly", "Monthly"])
    .default("None"),
});

export const createTaskSchema = taskBaseSchema
  .refine(
    (data) =>
      !data.start_date ||
      !data.due_date ||
      data.start_date <= data.due_date,
    {
      message: "Start date must be before or equal to due date",
      path: ["start_date"],
    }
  )
  .refine(
    (data) => !data.revenue_tagged || !!data.revenue_amount,
    {
      message: "Revenue amount is required when revenue is tagged",
      path: ["revenue_amount"],
    }
  );

export const updateTaskSchema = taskBaseSchema
  .partial()
  .extend({ status: z.enum(["Todo", "InProgress", "Done", "Cancelled"]).optional() });

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
