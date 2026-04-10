import { z } from "zod";

const leadBaseSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters").max(100),
  phone: z.string().min(7, "Enter a valid phone number").max(20),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  whatsapp: z.string().optional().or(z.literal("")),
  lead_source: z.string().min(1, "Lead source is required"),
  temperature: z.enum(["Hot", "Warm", "Cold", "FollowUpLater"]).default("Cold"),
  lead_owner_id: z.string().min(1, "Lead owner is required"),
  assigned_to_id: z.string().min(1, "Assignee is required"),
  campaign_source: z.string().optional().or(z.literal("")),
  referral_source: z.string().optional().or(z.literal("")),
  budget_min: z.coerce.number().positive().optional(),
  budget_max: z.coerce.number().positive().optional(),
  property_type: z.enum(["Residential", "Commercial", "Plot", "Villa", "Apartment", "Office"], {
    required_error: "Property type is required",
  }),
  unit_type: z.string().optional().or(z.literal("")),
  location_preference: z.string().optional().or(z.literal("")),
  timeline_to_buy: z.string().optional().or(z.literal("")),
  purpose: z.enum(["EndUse", "Investment"], {
    required_error: "Purpose is required",
  }),
  next_followup_date: z.coerce.date().optional(),
  followup_type: z
    .enum(["Call", "Email", "WhatsApp", "Visit", "Meeting"])
    .optional(),
  reason_for_interest: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  potential_lead_value: z.coerce.number().positive("Potential lead value must be a positive number"),
});

export const createLeadSchema = leadBaseSchema.refine(
  (data) =>
    !data.budget_min ||
    !data.budget_max ||
    data.budget_min <= data.budget_max,
  { message: "Budget min must be ≤ budget max", path: ["budget_min"] }
);

export const updateLeadSchema = leadBaseSchema.partial();

export const changeStageSchema = z
  .object({
    to_stage: z.enum([
      "New",
      "Contacted",
      "Qualified",
      "Requirement",
      "OpportunityTagged",
      "Visit",
      "FollowUp",
      "Negotiation",
      "Won",
      "Lost",
      "OnHold",
      "Recycle",
    ]),
    notes: z.string().optional().or(z.literal("")),
    lost_reason: z
      .enum([
        "Budget",
        "Location",
        "Configuration",
        "Timing",
        "NotSerious",
        "Financing",
        "PurchasedElsewhere",
        "Other",
      ])
      .optional(),
    lost_notes: z.string().optional().or(z.literal("")),
  })
  .refine(
    (data) => data.to_stage !== "Lost" || !!data.lost_reason,
    {
      message: "Lost reason is required when marking as Lost",
      path: ["lost_reason"],
    }
  );

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type ChangeStageInput = z.infer<typeof changeStageSchema>;
