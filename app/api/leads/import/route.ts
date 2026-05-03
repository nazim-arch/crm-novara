import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { generateId } from "@/lib/id-generator";
import { hasPermission } from "@/lib/rbac";
import { z } from "zod";

const importRowSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters").max(100),
  phone: z.string().min(7, "Enter a valid phone number").max(20),
  lead_source: z.string().min(1, "Lead source is required"),
  property_type: z.enum(
    ["Residential", "Commercial", "Plot", "Villa", "Apartment", "Office"],
    { message: "Property Type must be one of: Residential, Commercial, Plot, Villa, Apartment, Office" }
  ),
  purpose: z.enum(["EndUse", "Investment"], {
    message: "Purpose must be EndUse or Investment",
  }),
  potential_lead_value: z.coerce
    .number({ invalid_type_error: "Potential Lead Value must be a number" })
    .positive("Potential Lead Value must be positive"),
  email: z.string().email("Invalid email").optional().or(z.literal("")).transform(v => v || null),
  whatsapp: z.string().optional().or(z.literal("")).transform(v => v || null),
  temperature: z.enum(["Hot", "Warm", "Cold", "FollowUpLater"]).default("Cold"),
  budget_min: z.coerce.number().positive().optional(),
  budget_max: z.coerce.number().positive().optional(),
  unit_type: z.string().optional().or(z.literal("")).transform(v => v || null),
  location_preference: z.string().optional().or(z.literal("")).transform(v => v || null),
  timeline_to_buy: z.string().optional().or(z.literal("")).transform(v => v || null),
  campaign_source: z.string().optional().or(z.literal("")).transform(v => v || null),
  referral_source: z.string().optional().or(z.literal("")).transform(v => v || null),
  reason_for_interest: z.string().optional().or(z.literal("")).transform(v => v || null),
  notes: z.string().optional().or(z.literal("")).transform(v => v || null),
});

export interface ImportResult {
  created: number;
  failed: { row: number; name: string; errors: string[] }[];
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(session.user.role, "lead:create")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const rows: Record<string, unknown>[] = body.leads ?? [];

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No lead rows provided" }, { status: 400 });
    }
    if (rows.length > 500) {
      return NextResponse.json({ error: "Maximum 500 leads per import" }, { status: 400 });
    }

    const userId = session.user.id;
    const result: ImportResult = { created: 0, failed: [] };

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const rowNum = i + 2; // Excel row number (1 = header, data starts at 2)
      const displayName = String(raw.full_name ?? raw.name ?? `Row ${rowNum}`);

      const parsed = importRowSchema.safeParse(raw);
      if (!parsed.success) {
        const errors = parsed.error.issues.map(e => `${e.path.join(".")}: ${e.message}`);
        result.failed.push({ row: rowNum, name: displayName, errors });
        continue;
      }

      const data = parsed.data;

      // budget_min must be ≤ budget_max if both provided
      if (data.budget_min && data.budget_max && data.budget_min > data.budget_max) {
        result.failed.push({ row: rowNum, name: displayName, errors: ["budget_min must be ≤ budget_max"] });
        continue;
      }

      try {
        const lead_number = await generateId("LEAD");

        const lead = await prisma.lead.create({
          data: {
            lead_number,
            full_name: data.full_name,
            phone: data.phone,
            email: data.email ?? null,
            whatsapp: data.whatsapp ?? null,
            lead_source: data.lead_source,
            temperature: data.temperature,
            property_type: data.property_type,
            purpose: data.purpose,
            potential_lead_value: data.potential_lead_value,
            budget_min: data.budget_min ?? null,
            budget_max: data.budget_max ?? null,
            unit_type: data.unit_type ?? null,
            location_preference: data.location_preference ?? null,
            timeline_to_buy: data.timeline_to_buy ?? null,
            campaign_source: data.campaign_source ?? null,
            referral_source: data.referral_source ?? null,
            reason_for_interest: data.reason_for_interest ?? null,
            // owner, assignee, creator all default to current user for bulk import
            lead_owner_id: userId,
            assigned_to_id: userId,
            created_by_id: userId,
          },
        });

        await Promise.all([
          prisma.activity.create({
            data: {
              entity_type: "Lead",
              entity_id: lead.id,
              action: "lead_created",
              actor_id: userId,
              metadata: {
                lead_number: lead.lead_number,
                full_name: lead.full_name,
                source: "excel_import",
              },
            },
          }),
          prisma.leadStageHistory.create({
            data: {
              lead_id: lead.id,
              to_stage: "New",
              changed_by_id: userId,
              notes: "Lead imported via Excel",
            },
          }),
        ]);

        result.created++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Database error";
        // Duplicate phone constraint
        const isDupe = msg.includes("Unique constraint") || msg.includes("unique");
        result.failed.push({
          row: rowNum,
          name: displayName,
          errors: [isDupe ? `Phone number already exists: ${data.phone}` : "Failed to create lead"],
        });
      }
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("POST /api/leads/import:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
