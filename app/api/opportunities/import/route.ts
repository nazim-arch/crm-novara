import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { generateId } from "@/lib/id-generator";
import { hasPermissionAsync } from "@/lib/rbac";
import { z } from "zod";
import type { ImportResult } from "@/lib/import/types";

const importRowSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(200),
  project: z.string().min(1, "Project is required"),
  property_type: z.enum(["Residential", "Commercial", "Plot", "Villa", "Apartment", "Office", "Land"], {
    message: "Property Type must be one of: Residential, Commercial, Plot, Villa, Apartment, Office, Land",
  }),
  location: z.string().min(1, "Location is required"),
  commission_percent: z.coerce.number({ error: "Commission % must be a number" }).positive("Commission % must be > 0").max(100, "Commission % cannot exceed 100"),
  opportunity_by: z.enum(["Developer", "Seller", "Buyer"]).default("Developer"),
  status: z.enum(["Active", "Inactive", "Sold"]).default("Active"),
  developer: z.string().optional().or(z.literal("")).transform((v) => v || null),
  notes: z.string().optional().or(z.literal("")).transform((v) => v || null),
  units: z.coerce.number().int().positive().optional(),
  price_per_unit: z.coerce.number().positive().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPermissionAsync(session.user.role, "opportunity:import"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const rows: Record<string, unknown>[] = body.rows ?? [];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No opportunity rows provided" }, { status: 400 });
    }
    if (rows.length > 500) {
      return NextResponse.json({ error: "Maximum 500 opportunities per import" }, { status: 400 });
    }

    const userId = session.user.id;
    const result: ImportResult = { created: 0, failed: [] };

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const rowNum = i + 2; // Excel row (1 = header)
      const displayName = String(raw.name ?? `Row ${rowNum}`);

      const parsed = importRowSchema.safeParse(raw);
      if (!parsed.success) {
        result.failed.push({ row: rowNum, name: displayName, errors: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`) });
        continue;
      }
      const data = parsed.data;

      try {
        // Soft dedup by name + project (no DB unique constraint exists).
        const existing = await prisma.opportunity.findFirst({
          where: { deleted_at: null, name: { equals: data.name, mode: "insensitive" }, project: { equals: data.project, mode: "insensitive" } },
          select: { opp_number: true },
        });
        if (existing) {
          result.failed.push({ row: rowNum, name: displayName, errors: [`Opportunity already exists: ${data.name} / ${data.project} (${existing.opp_number})`] });
          continue;
        }

        // Synthesize a single minimal configuration from flat units/price columns.
        const number_of_units = data.units ?? 1;
        const price_per_unit = data.price_per_unit ?? 0;
        const row_total = number_of_units * price_per_unit;
        const total_sales_value = row_total;
        const possible_revenue = (total_sales_value * data.commission_percent) / 100;

        const opp_number = await generateId("OPP");
        const opp = await prisma.opportunity.create({
          data: {
            opp_number,
            name: data.name,
            project: data.project,
            property_type: data.property_type,
            location: data.location,
            commission_percent: data.commission_percent,
            opportunity_by: data.opportunity_by,
            status: data.status,
            developer: data.developer,
            notes: data.notes,
            total_sales_value,
            possible_revenue,
            created_by_id: userId,
            configurations: {
              create: [{ label: "", number_of_units, price_per_unit, row_total }],
            },
          },
        });

        await prisma.activity.create({
          data: {
            entity_type: "Opportunity",
            entity_id: opp.id,
            action: "opportunity_created",
            actor_id: userId,
            metadata: { opp_number: opp.opp_number, name: opp.name, source: "excel_import" },
          },
        });

        result.created++;
      } catch (err) {
        console.error("opportunity import row:", err);
        result.failed.push({ row: rowNum, name: displayName, errors: ["Failed to create opportunity"] });
      }
    }

    // Import-run summary (audit) — entity_id = importer per the export-audit convention.
    await prisma.activity.create({
      data: {
        entity_type: "Opportunity",
        entity_id: userId,
        action: "opportunity_import",
        actor_id: userId,
        metadata: { created: result.created, failed_count: result.failed.length, source: "excel_import" },
      },
    });

    revalidateTag("crm-dashboard", "max");
    revalidateTag("leads-filter-options", "max"); // new opportunities feed the leads-page filter
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("POST /api/opportunities/import:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
