import { z } from "zod";

export const configurationRowSchema = z.object({
  id: z.string().optional(), // present on existing rows during edit
  label: z.string().min(1, "Label is required"),
  number_of_units: z.coerce
    .number({ message: "Must be a number" })
    .int("Must be a whole number")
    .min(1, "Must be at least 1"),
  price_per_unit: z.coerce
    .number({ message: "Must be a number" })
    .positive("Must be greater than 0"),
});

export type ConfigurationRowInput = z.infer<typeof configurationRowSchema>;

const opportunityBaseSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(200),
  project: z.string().min(1, "Project is required"),
  developer: z.string().optional().or(z.literal("")),
  property_type: z.enum(
    ["Residential", "Commercial", "Plot", "Villa", "Apartment", "Office"],
    { message: "Property type is required" }
  ),
  location: z.string().min(1, "Location is required"),
  commission_percent: z.coerce
    .number({ message: "Commission % is required" })
    .positive("Must be greater than 0")
    .max(100, "Cannot exceed 100%"),
  status: z.enum(["Active", "Inactive", "Sold"]).default("Active"),
  notes: z.string().optional().or(z.literal("")),
  configurations: z
    .array(configurationRowSchema)
    .min(1, "At least one configuration row is required"),
});

export const createOpportunitySchema = opportunityBaseSchema;

export const updateOpportunitySchema = opportunityBaseSchema.extend({
  configurations: z
    .array(
      configurationRowSchema.extend({
        _delete: z.boolean().optional(), // flag to delete existing rows
      })
    )
    .min(1, "At least one configuration row is required"),
});

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
