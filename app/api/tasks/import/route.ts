import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { generateId } from "@/lib/id-generator";
import { hasPermissionAsync } from "@/lib/rbac";
import { parseImportDate } from "@/lib/import/excel-date";
import { z } from "zod";
import type { ImportResult } from "@/lib/import/types";

const importRowSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  due_date: z.string().min(1, "Due date is required"), // parsed via parseImportDate below
  priority: z.enum(["Low", "Medium", "High", "Critical"]).default("Medium"),
  start_date: z.string().optional().or(z.literal("")).transform((v) => v || null),
  assigned_to: z.string().optional().or(z.literal("")).transform((v) => v || null),
  sector: z.string().optional().or(z.literal("")).transform((v) => v || null),
  lead_number: z.string().optional().or(z.literal("")).transform((v) => v || null),
  opp_number: z.string().optional().or(z.literal("")).transform((v) => v || null),
  client_name: z.string().optional().or(z.literal("")).transform((v) => v || null),
  revenue_amount: z.coerce.number().positive().optional(),
  notes: z.string().optional().or(z.literal("")).transform((v) => v || null),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPermissionAsync(session.user.role, "task:import"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const rows: Record<string, unknown>[] = body.rows ?? [];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No task rows provided" }, { status: 400 });
    }
    if (rows.length > 500) {
      return NextResponse.json({ error: "Maximum 500 tasks per import" }, { status: 400 });
    }

    const userId = session.user.id;
    const result: ImportResult = { created: 0, failed: [] };

    // Pre-resolve reference maps (batch) so per-row lookups are O(1).
    const names = new Set<string>();
    const leadNums = new Set<string>();
    const oppNums = new Set<string>();
    const clientNames = new Set<string>();
    for (const r of rows) {
      const an = (r.assigned_to as string)?.trim(); if (an) names.add(an.toLowerCase());
      const ln = (r.lead_number as string)?.trim(); if (ln) leadNums.add(ln.toUpperCase());
      const on = (r.opp_number as string)?.trim(); if (on) oppNums.add(on.toUpperCase());
      const cn = (r.client_name as string)?.trim(); if (cn) clientNames.add(cn.toLowerCase());
    }

    const [users, leads, opps, clients] = await Promise.all([
      names.size ? prisma.user.findMany({ where: { is_active: true }, select: { id: true, name: true } }) : Promise.resolve([]),
      leadNums.size ? prisma.lead.findMany({ where: { deleted_at: null, lead_number: { in: [...leadNums] } }, select: { id: true, lead_number: true } }) : Promise.resolve([]),
      oppNums.size ? prisma.opportunity.findMany({ where: { deleted_at: null, opp_number: { in: [...oppNums] } }, select: { id: true, opp_number: true } }) : Promise.resolve([]),
      clientNames.size ? prisma.client.findMany({ where: { is_active: true }, select: { id: true, name: true } }) : Promise.resolve([]),
    ]);
    const userByName = new Map(users.map((u) => [u.name.toLowerCase(), u.id]));
    const leadByNum = new Map(leads.map((l) => [l.lead_number.toUpperCase(), l.id]));
    const oppByNum = new Map(opps.map((o) => [o.opp_number.toUpperCase(), o.id]));
    const clientByName = new Map(clients.map((c) => [c.name.toLowerCase(), c.id]));

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const rowNum = i + 2;
      const displayName = String(raw.title ?? `Row ${rowNum}`);

      const parsed = importRowSchema.safeParse(raw);
      if (!parsed.success) {
        result.failed.push({ row: rowNum, name: displayName, errors: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`) });
        continue;
      }
      const data = parsed.data;

      const due = parseImportDate(data.due_date);
      if (!due) {
        result.failed.push({ row: rowNum, name: displayName, errors: [`Invalid due date: ${data.due_date}`] });
        continue;
      }
      const start = data.start_date ? parseImportDate(data.start_date) : null;
      if (data.start_date && !start) {
        result.failed.push({ row: rowNum, name: displayName, errors: [`Invalid start date: ${data.start_date}`] });
        continue;
      }
      if (start && start > due) {
        result.failed.push({ row: rowNum, name: displayName, errors: ["Start date must be before or equal to due date"] });
        continue;
      }

      // Resolve assignee (defaults to importer; error only if a name was given but unmatched).
      let assigneeId = userId;
      if (data.assigned_to) {
        const found = userByName.get(data.assigned_to.toLowerCase());
        if (!found) { result.failed.push({ row: rowNum, name: displayName, errors: [`User not found: "${data.assigned_to}"`] }); continue; }
        assigneeId = found;
      }
      // Optional FK links — error if provided but unmatched.
      let leadId: string | null = null;
      if (data.lead_number) {
        leadId = leadByNum.get(data.lead_number.toUpperCase()) ?? null;
        if (!leadId) { result.failed.push({ row: rowNum, name: displayName, errors: [`Lead not found: ${data.lead_number}`] }); continue; }
      }
      let oppId: string | null = null;
      if (data.opp_number) {
        oppId = oppByNum.get(data.opp_number.toUpperCase()) ?? null;
        if (!oppId) { result.failed.push({ row: rowNum, name: displayName, errors: [`Opportunity not found: ${data.opp_number}`] }); continue; }
      }
      let clientId: string | null = null;
      if (data.client_name) {
        clientId = clientByName.get(data.client_name.toLowerCase()) ?? null;
        if (!clientId) { result.failed.push({ row: rowNum, name: displayName, errors: [`Client not found: ${data.client_name}`] }); continue; }
      }

      try {
        const task_number = await generateId("TASK");
        const task = await prisma.task.create({
          data: {
            task_number,
            title: data.title,
            priority: data.priority,
            status: "Todo",
            due_date: due,
            start_date: start,
            sector: data.sector,
            notes: data.notes,
            revenue_tagged: data.revenue_amount != null,
            revenue_amount: data.revenue_amount ?? null,
            assigned_to_id: assigneeId,
            created_by_id: userId,
            lead_id: leadId,
            opportunity_id: oppId,
            client_id: clientId,
          },
        });

        await prisma.activity.create({
          data: {
            entity_type: "Task",
            entity_id: task.id,
            action: "task_created",
            actor_id: userId,
            metadata: { task_number: task.task_number, title: task.title, source: "excel_import" },
          },
        });

        result.created++;
      } catch (err) {
        console.error("task import row:", err);
        result.failed.push({ row: rowNum, name: displayName, errors: ["Failed to create task"] });
      }
    }

    await prisma.activity.create({
      data: {
        entity_type: "Task",
        entity_id: userId,
        action: "task_import",
        actor_id: userId,
        metadata: { created: result.created, failed_count: result.failed.length, source: "excel_import" },
      },
    });

    revalidateTag("crm-dashboard", "max");
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("POST /api/tasks/import:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
