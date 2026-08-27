import { z } from "zod";

export const createTaskTemplateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().optional().or(z.literal("")),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).default("Medium"),
  sector: z.string().optional().or(z.literal("")),
  checklist: z.array(z.object({ text: z.string(), done: z.boolean() })).optional(),
  due_in_days: z.coerce.number().int().min(0).max(365).optional(),
  recurrence: z.enum(["None", "Daily", "Weekly", "Monthly"]).default("None"),
  recurrence_interval: z.coerce.number().int().min(1).max(365).default(1),
  revenue_tagged: z.boolean().default(false),
  revenue_amount: z.coerce.number().positive().optional(),
  default_assignee_id: z.string().optional(),
  client_id: z.string().optional(),
});

export type CreateTaskTemplateInput = z.infer<typeof createTaskTemplateSchema>;
