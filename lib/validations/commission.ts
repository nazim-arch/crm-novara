import { z } from "zod";

export const slabRowSchema = z.object({
  from_amount: z.number().min(0),
  to_amount: z.number().positive().nullable().optional(),
  commission_pct: z.number().min(0).max(100),
  sort_order: z.number().int().min(0),
});

export const saveSlabsSchema = z.object({
  user_id: z.string().cuid(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  slabs: z.array(slabRowSchema).min(1, "At least one slab required"),
});

export const upsertTargetSchema = z.object({
  user_id: z.string().cuid(),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  target_amount: z.number().positive(),
});

export const calculateQuerySchema = z.object({
  user_id: z.string().cuid(),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

export const reportQuerySchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

export const finalizeSchema = z.object({
  rec_status: z.literal("Finalized"),
});
