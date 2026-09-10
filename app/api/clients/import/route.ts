import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermissionAsync } from "@/lib/rbac";
import { hasIndiaPlus91 } from "@/lib/phone";
import { z } from "zod";
import type { ImportResult } from "@/lib/import/types";

const importRowSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  industry: z.string().optional().or(z.literal("")).transform((v) => v || null),
  contact_person: z.string().optional().or(z.literal("")).transform((v) => v || null),
  contact_email: z.string().email("Invalid email").optional().or(z.literal("")).transform((v) => v || null),
  contact_phone: z.string().optional().or(z.literal(""))
    .refine((v) => !v || hasIndiaPlus91(v), "Phone must include the +91 country code (e.g. +919876543210)")
    .transform((v) => v || null),
  notes: z.string().optional().or(z.literal("")).transform((v) => v || null),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPermissionAsync(session.user.role, "client:import"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const rows: Record<string, unknown>[] = body.rows ?? [];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No client rows provided" }, { status: 400 });
    }
    if (rows.length > 500) {
      return NextResponse.json({ error: "Maximum 500 clients per import" }, { status: 400 });
    }

    const userId = session.user.id;
    const result: ImportResult = { created: 0, failed: [] };

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const rowNum = i + 2;
      const displayName = String(raw.name ?? `Row ${rowNum}`);

      const parsed = importRowSchema.safeParse(raw);
      if (!parsed.success) {
        result.failed.push({ row: rowNum, name: displayName, errors: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`) });
        continue;
      }
      const data = parsed.data;

      try {
        // Dedup by case-insensitive name (and contact_email when present).
        const orClauses: { name?: { equals: string; mode: "insensitive" }; contact_email?: { equals: string; mode: "insensitive" } }[] = [
          { name: { equals: data.name, mode: "insensitive" } },
        ];
        if (data.contact_email) orClauses.push({ contact_email: { equals: data.contact_email, mode: "insensitive" } });
        const existing = await prisma.client.findFirst({ where: { OR: orClauses }, select: { id: true, name: true } });
        if (existing) {
          result.failed.push({ row: rowNum, name: displayName, errors: [`Client already exists: ${existing.name}`] });
          continue;
        }

        const client = await prisma.client.create({
          data: {
            name: data.name,
            industry: data.industry,
            contact_person: data.contact_person,
            contact_email: data.contact_email,
            contact_phone: data.contact_phone,
            notes: data.notes,
          },
        });

        await prisma.activity.create({
          data: {
            entity_type: "Client",
            entity_id: client.id,
            action: "client_created",
            actor_id: userId,
            metadata: { name: client.name, source: "excel_import" },
          },
        });

        result.created++;
      } catch (err) {
        console.error("client import row:", err);
        result.failed.push({ row: rowNum, name: displayName, errors: ["Failed to create client"] });
      }
    }

    await prisma.activity.create({
      data: {
        entity_type: "Client",
        entity_id: userId,
        action: "client_import",
        actor_id: userId,
        metadata: { created: result.created, failed_count: result.failed.length, source: "excel_import" },
      },
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("POST /api/clients/import:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
