import { z } from "zod";

// The user-authored report definition. Every field/op/aggregation here is a
// plain string that is RE-validated against the field registry at compile time
// (lib/reports/registry.ts) before anything reaches Prisma — this schema only
// checks shape, the registry enforces the allow-list.

export const REPORT_ENTITIES = ["lead", "opportunity", "task", "followup", "activity", "dealclosure"] as const;
export type ReportEntity = (typeof REPORT_ENTITIES)[number];

export const FILTER_OPS = ["eq", "neq", "in", "contains", "gt", "gte", "lt", "lte", "between", "isNull", "isNotNull"] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export const AGGREGATIONS = ["count", "sum", "avg", "min", "max"] as const;
export type Aggregation = (typeof AGGREGATIONS)[number];

export const REPORT_MODES = ["list", "aggregate"] as const;
export type ReportMode = (typeof REPORT_MODES)[number];

export const reportFilterSchema = z.object({
  field: z.string().min(1),
  op: z.enum(FILTER_OPS),
  value: z.unknown().optional(),
});
export type ReportFilter = z.infer<typeof reportFilterSchema>;

export const reportDefinitionSchema = z.object({
  entity: z.enum(REPORT_ENTITIES),
  mode: z.enum(REPORT_MODES).default("list"),
  filters: z.array(reportFilterSchema).max(20).default([]),
  columns: z.array(z.string()).max(40).default([]),
  groupBy: z.array(z.string()).max(2).default([]),
  aggregations: z.array(z.object({ field: z.string().nullable(), fn: z.enum(AGGREGATIONS) })).max(10).default([]),
  sort: z.array(z.object({ field: z.string(), dir: z.enum(["asc", "desc"]) })).max(5).default([]),
  dateRange: z
    .object({ field: z.string(), range: z.string(), from: z.string().optional(), to: z.string().optional() })
    .optional(),
  limit: z.number().int().min(1).max(5000).default(1000),
});
export type ReportDefinition = z.infer<typeof reportDefinitionSchema>;

export const savedReportCreateSchema = z.object({
  name: z.string().min(1).max(120),
  entity: z.enum(REPORT_ENTITIES),
  definition: reportDefinitionSchema,
});
