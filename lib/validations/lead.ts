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
    message: "Property type is required",
  }),
  unit_type: z.string().optional().or(z.literal("")),
  location_preference: z.string().optional().or(z.literal("")),
  timeline_to_buy: z.string().optional().or(z.literal("")),
  purpose: z.enum(["EndUse", "Investment"], {
    message: "Purpose is required",
  }),
  next_followup_date: z.coerce.date().optional(),
  followup_type: z
    .enum(["Call", "Email", "WhatsApp", "Visit", "Meeting", "Activity"])
    .optional(),
  reason_for_interest: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  potential_lead_value: z.coerce.number().positive("Potential lead value must be a positive number"),
  financing_required: z.boolean().optional(),
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
      "Qualified",
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
    settlement_value: z.coerce.number().positive("Settlement value must be a positive number").optional(),
    deal_commission_percent: z.coerce.number().min(0).max(100).optional(),
  })
  .refine(
    (data) => data.to_stage !== "Lost" || !!data.lost_reason,
    { message: "Lost reason is required when marking as Lost", path: ["lost_reason"] }
  )
  .refine(
    (data) => data.to_stage !== "Won" || (!!data.settlement_value && data.deal_commission_percent !== undefined),
    { message: "Settlement value and commission % are required when marking as Won", path: ["settlement_value"] }
  );

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type ChangeStageInput = z.infer<typeof changeStageSchema>;
