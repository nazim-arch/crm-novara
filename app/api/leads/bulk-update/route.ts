import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermission, leadScopeFilter } from "@/lib/rbac";
import { z } from "zod";

// ── Validation ─────────────────────────────────────────────────────────────

const VALID_STATUSES = ["New", "Prospect", "SiteVisitCompleted", "Negotiation", "Won", "Lost", "OnHold", "Recycle"] as const;
const VALID_TEMPS    = ["Hot", "Warm", "Cold", "FollowUpLater"] as const;
const VALID_FU_TYPES = ["Call", "Email", "WhatsApp", "Visit", "Meeting", "Activity", "Internal"] as const;

function parseDate(val: unknown): Date | null {
  if (!val && val !== 0) return null;
  // Excel serial number (days since 1899-12-30)
  if (typeof val === "number") {
    const ms = (val - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof val === "string" && val.trim()) {
    // Try ISO and common formats
    const s = val.trim();
    // DD/MM/YYYY or DD-MM-YYYY
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      const d = new Date(`${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`);
      if (!isNaN(d.getTime())) return d;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  return null;
}

function optional<T>(val: T | undefined | null | ""): T | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  return val;
}

export interface BulkUpdateResult {
  updated: number;
  skipped: number;
  failed: { row: number; lead_number: string; errors: string[] }[];
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "lead:update"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const rows: Record<string, unknown>[] = body.leads ?? [];

    if (!Array.isArray(rows) || rows.length === 0)
      return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    if (rows.length > 500)
      return NextResponse.json({ error: "Maximum 500 rows per update" }, { status: 400 });

    const userId   = session.user.id;
    const role     = session.user.role;
    const scope    = leadScopeFilter(role, userId);

    // ── Batch: resolve assigned_to names → user IDs ─────────────────────
    const nameSet = new Set<string>();
    for (const r of rows) {
      const n = String(r.assigned_to_name ?? r.assigned_to ?? "").trim();
      if (n) nameSet.add(n.toLowerCase());
    }
    const allUsers = nameSet.size > 0
      ? await prisma.user.findMany({ select: { id: true, name: true } })
      : [];
    const userByName = new Map(allUsers.map(u => [u.name.toLowerCase(), u.id]));

    // ── Batch: fetch all referenced leads ────────────────────────────────
    const leadNumbers = rows
      .map(r => String(r.lead_number ?? "").trim().toUpperCase())
      .filter(Boolean);

    const scopeWhere = scope
      ? { lead_number: { in: leadNumbers }, deleted_at: null, ...scope }
      : { lead_number: { in: leadNumbers }, deleted_at: null };

    const existingLeads = await prisma.lead.findMany({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: scopeWhere as any,
      select: { id: true, lead_number: true, status: true, temperature: true },
    });
    const leadByNumber = new Map(existingLeads.map(l => [l.lead_number, l]));

    // ── Process each row ─────────────────────────────────────────────────
    const result: BulkUpdateResult = { updated: 0, skipped: 0, failed: [] };

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const rowNum = i + 2;
      const leadNum = String(raw.lead_number ?? "").trim().toUpperCase();

      if (!leadNum) {
        result.failed.push({ row: rowNum, lead_number: "—", errors: ["Lead Number is required"] });
        continue;
      }

      const lead = leadByNumber.get(leadNum);
      if (!lead) {
        result.failed.push({ row: rowNum, lead_number: leadNum, errors: ["Lead not found or not accessible"] });
        continue;
      }

      const rowErrors: string[] = [];

      // ── Parse & validate each updatable field ────────────────────────
      const rawTemp    = optional(raw.temperature ?? raw.priority);
      const rawStatus  = optional(raw.status ?? raw.stage);
      const rawFuDate  = raw.next_followup_date ?? raw.followup_date ?? raw.next_follow_up_date;
      const rawFuType  = optional(raw.followup_type ?? raw.follow_up_type);
      const rawValue   = optional(raw.potential_lead_value ?? raw.lead_value ?? raw.value);
      const rawAssignee = String(raw.assigned_to_name ?? raw.assigned_to ?? "").trim();
      const rawEmail   = optional(raw.email);
      const rawWa      = optional(raw.whatsapp);
      const rawBudMin  = optional(raw.budget_min);
      const rawBudMax  = optional(raw.budget_max);
      const rawLoc     = optional(raw.location_preference ?? raw.location);
      const rawUnit    = optional(raw.unit_type ?? raw.unit ?? raw.configuration);
      const rawTimeline = optional(raw.timeline_to_buy ?? raw.timeline);
      const rawNotes   = optional(raw.notes ?? raw.note ?? raw.remarks);

      // Validate enums
      if (rawTemp && !VALID_TEMPS.includes(rawTemp as typeof VALID_TEMPS[number]))
        rowErrors.push(`temperature: must be one of ${VALID_TEMPS.join(", ")}`);
      if (rawStatus && !VALID_STATUSES.includes(rawStatus as typeof VALID_STATUSES[number]))
        rowErrors.push(`status: must be one of ${VALID_STATUSES.join(", ")}`);
      if (rawFuType && !VALID_FU_TYPES.includes(rawFuType as typeof VALID_FU_TYPES[number]))
        rowErrors.push(`followup_type: must be one of ${VALID_FU_TYPES.join(", ")}`);

      // Validate date
      const fuDate = rawFuDate !== undefined && rawFuDate !== "" ? parseDate(rawFuDate) : undefined;
      if (rawFuDate !== undefined && rawFuDate !== "" && fuDate === null)
        rowErrors.push("next_followup_date: invalid date format (use YYYY-MM-DD)");

      // Validate assignee name
      let assigneeId: string | undefined;
      if (rawAssignee) {
        assigneeId = userByName.get(rawAssignee.toLowerCase());
        if (!assigneeId) rowErrors.push(`assigned_to: user "${rawAssignee}" not found`);
      }

      // Validate value
      let leadValue: number | undefined;
      if (rawValue !== undefined) {
        leadValue = Number(rawValue);
        if (isNaN(leadValue) || leadValue <= 0) rowErrors.push("potential_lead_value: must be a positive number");
      }

      // Validate budgets
      let budMin: number | undefined, budMax: number | undefined;
      if (rawBudMin !== undefined) {
        budMin = Number(rawBudMin);
        if (isNaN(budMin)) rowErrors.push("budget_min: must be a number");
      }
      if (rawBudMax !== undefined) {
        budMax = Number(rawBudMax);
        if (isNaN(budMax)) rowErrors.push("budget_max: must be a number");
      }
      if (budMin !== undefined && budMax !== undefined && budMin > budMax)
        rowErrors.push("budget_min must be ≤ budget_max");

      if (rowErrors.length > 0) {
        result.failed.push({ row: rowNum, lead_number: leadNum, errors: rowErrors });
        continue;
      }

      // ── Build update payload (only defined fields) ───────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: Record<string, any> = {};

      if (rawTemp)        updateData.temperature        = rawTemp;
      if (rawStatus)      updateData.status             = rawStatus;
      if (fuDate !== undefined) updateData.next_followup_date = fuDate;
      if (rawFuType)      updateData.followup_type      = rawFuType;
      if (leadValue)      updateData.potential_lead_value = leadValue;
      if (assigneeId)     updateData.assigned_to_id     = assigneeId;
      if (rawEmail)       updateData.email              = String(rawEmail);
      if (rawWa)          updateData.whatsapp           = String(rawWa);
      if (budMin)         updateData.budget_min         = budMin;
      if (budMax)         updateData.budget_max         = budMax;
      if (rawLoc)         updateData.location_preference = String(rawLoc);
      if (rawUnit)        updateData.unit_type          = String(rawUnit);
      if (rawTimeline)    updateData.timeline_to_buy    = String(rawTimeline);

      // Nothing to update?
      if (Object.keys(updateData).length === 0 && !rawNotes) {
        result.skipped++;
        continue;
      }

      try {
        const statusChanged = rawStatus && rawStatus !== lead.status;

        await prisma.$transaction(async (tx) => {
          // Update the lead
          if (Object.keys(updateData).length > 0) {
            await tx.lead.update({ where: { id: lead.id }, data: updateData });
          }

          // Stage history for status change
          if (statusChanged) {
            await tx.leadStageHistory.create({
              data: {
                lead_id:       lead.id,
                from_stage:    lead.status as Parameters<typeof tx.leadStageHistory.create>[0]["data"]["from_stage"],
                to_stage:      rawStatus as Parameters<typeof tx.leadStageHistory.create>[0]["data"]["to_stage"],
                changed_by_id: userId,
                notes:         "Updated via Excel bulk upload",
              },
            });
          }

          // Note entry if notes provided
          if (rawNotes) {
            await tx.note.create({
              data: {
                entity_type:   "Lead",
                entity_id:     lead.id,
                content:       String(rawNotes),
                created_by_id: userId,
              },
            });
          }

          // Activity log
          await tx.activity.create({
            data: {
              entity_type: "Lead",
              entity_id:   lead.id,
              action:      "lead_updated",
              actor_id:    userId,
              metadata: {
                source:      "excel_bulk_update",
                fields:      Object.keys(updateData),
                lead_number: leadNum,
              },
            },
          });
        });

        result.updated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Database error";
        result.failed.push({ row: rowNum, lead_number: leadNum, errors: [msg] });
      }
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("POST /api/leads/bulk-update:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
