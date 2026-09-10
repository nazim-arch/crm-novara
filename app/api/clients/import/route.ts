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
    type Valid = { data: z.infer<typeof importRowSchema> };
    const valid: Valid[] = [];
    const seenNames = new Set<string>();

    // ── Phase 1: validate every row (all-or-nothing) ──────────────────────────
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
      const errors: string[] = [];

      if (seenNames.has(data.name.toLowerCase())) errors.push(`Duplicate client name within file: ${data.name}`);
      const orClauses: { name?: { equals: string; mode: "insensitive" }; contact_email?: { equals: string; mode: "insensitive" } }[] = [
        { name: { equals: data.name, mode: "insensitive" } },
      ];
      if (data.contact_email) orClauses.push({ contact_email: { equals: data.contact_email, mode: "insensitive" } });
      const existing = await prisma.client.findFirst({ where: { OR: orClauses }, select: { name: true } });
      if (existing) errors.push(`Client already exists: ${existing.name}`);

      if (errors.length) { result.failed.push({ row: rowNum, name: displayName, errors }); continue; }
      seenNames.add(data.name.toLowerCase());
      valid.push({ data });
    }

    if (result.failed.length > 0) return NextResponse.json(result, { status: 200 });

    // ── Phase 2: insert all valid rows ────────────────────────────────────────
    for (const { data } of valid) {
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
        data: { entity_type: "Client", entity_id: client.id, action: "client_created", actor_id: userId, metadata: { name: client.name, source: "excel_import" } },
      });
      result.created++;
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
