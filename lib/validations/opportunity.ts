import { z } from "zod";

export const AREA_UNITS = ["SqFt", "Acre", "Guntha", "Cent"] as const;
export const SALE_TYPES = ["ForSale", "Requirement"] as const;
export const OPPORTUNITY_BY = ["Developer", "Seller", "Buyer"] as const;
export const PROPERTY_TYPES = ["Residential", "Commercial", "Plot", "Villa", "Apartment", "Office", "Land"] as const;

export const configurationRowSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1, "Label is required"),
  number_of_units: z.coerce.number({ message: "Must be a number" }).int("Must be a whole number").min(1, "Must be at least 1"),
  price_per_unit: z.coerce.number({ message: "Must be a number" }).positive("Must be greater than 0"),
  // Land-specific (optional — only used when property_type = Land)
  land_area: z.coerce.number().positive("Must be greater than 0").optional().nullable(),
  area_unit: z.enum(AREA_UNITS).optional().nullable(),
  sale_type: z.enum(SALE_TYPES).optional().nullable(),
});

export type ConfigurationRowInput = z.infer<typeof configurationRowSchema>;

const opportunityBaseSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(200),
  project: z.string().min(1, "Project is required"),
  developer: z.string().optional().or(z.literal("")),
  opportunity_by: z.enum(OPPORTUNITY_BY).default("Developer"),
  property_type: z.enum(PROPERTY_TYPES, { message: "Property type is required" }),
  location: z.string().min(1, "Location is required"),
  commission_percent: z.coerce
    .number({ message: "Commission % is required" })
    .positive("Must be greater than 0")
    .max(100, "Cannot exceed 100%"),
  status: z.enum(["Active", "Inactive", "Sold"]).default("Active"),
  notes: z.string().optional().or(z.literal("")),
  configurations: z.array(configurationRowSchema).min(1, "At least one configuration row is required"),
});

export const createOpportunitySchema = opportunityBaseSchema;

export const updateOpportunitySchema = opportunityBaseSchema.extend({
  configurations: z
    .array(
      configurationRowSchema.extend({
        _delete: z.boolean().optional(),
      })
    )
    .min(1, "At least one configuration row is required"),
});

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
