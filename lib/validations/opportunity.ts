import { z } from "zod";

const opportunityBaseSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(200),
  project: z.string().min(1, "Project is required"),
  sector: z.string().optional().or(z.literal("")),
  developer: z.string().optional().or(z.literal("")),
  property_type: z.enum([
    "Residential",
    "Commercial",
    "Plot",
    "Villa",
    "Apartment",
    "Office",
  ]),
  unit_types: z.array(z.string()).default([]),
  location: z.string().min(1, "Location is required"),
  price_min: z.coerce.number().positive().optional(),
  price_max: z.coerce.number().positive().optional(),
  commission_type: z.enum(["Fixed", "Percentage"]).default("Percentage"),
  commission_value: z.coerce.number().min(0, "Commission value must be non-negative").default(0),
  status: z.enum(["Active", "Inactive", "Sold"]).default("Active"),
  notes: z.string().optional().or(z.literal("")),
  opportunity_source: z.string().optional().or(z.literal("")),
  unit_value: z.coerce.number().positive().optional(),
  number_of_units: z.coerce.number().int().positive().optional(),
  total_sales_value: z.coerce.number().positive().optional(),
  commission_percent: z.coerce.number().positive().optional(),
  possible_revenue: z.coerce.number().positive().optional(),
  closed_revenue: z.coerce.number().positive().optional(),
});

export const createOpportunitySchema = opportunityBaseSchema.refine(
  (data) =>
    !data.price_min || !data.price_max || data.price_min <= data.price_max,
  { message: "Price min must be ≤ price max", path: ["price_min"] }
);

export const updateOpportunitySchema = opportunityBaseSchema.partial();

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
