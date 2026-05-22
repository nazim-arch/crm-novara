import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { NextResponse } from "next/server";

const PAGE_SIZE = 100;

type Meta = Record<string, unknown>;

function extractNotes(action: string, meta: Meta): string {
  const notes = meta.notes ? String(meta.notes) : null;
  if (notes) return notes;
  switch (action) {
    case "note_added":
      return meta.preview ? String(meta.preview) : "";
    case "followup_completed":
      return meta.outcome ? String(meta.outcome) : "";
    case "opportunity_tagged":
      return meta.opportunity_name ? `Tagged: ${meta.opportunity_name}` : "";
    case "no_response":
      return meta.callback_at
        ? `Callback: ${new Date(String(meta.callback_at)).toLocaleString("en-IN")}`
        : meta.next_date
        ? `Next: ${String(meta.next_date)}`
        : "";
    case "callback_scheduled":
      return meta.callback_at
        ? `Callback: ${new Date(String(meta.callback_at)).toLocaleString("en-IN")}`
        : "";
    case "lead_updated":
      return Array.isArray(meta.fields) ? `Fields: ${(meta.fields as string[]).join(", ")}` : "";
    default:
      return "";
  }
}

function extractStage(meta: Meta): { pipeline_from: string; pipeline_to: string; activity_from: string; activity_to: string } {
  return {
    pipeline_from: meta.pipeline_from ? String(meta.pipeline_from) : "",
    pipeline_to: meta.pipeline_to ? String(meta.pipeline_to) : "",
    activity_from: meta.activity_from ? String(meta.activity_from) : "",
    activity_to: meta.activity_to ? String(meta.activity_to) : "",
  };
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    stage_changed: "Stage Changed",
    activity_stage_changed: "Activity Stage Changed",
    note_added: "Note Added",
    lead_updated: "Lead Updated",
    lead_created: "Lead Created",
    opportunity_tagged: "Opportunity Tagged",
    followup_completed: "Follow-up Completed",
    no_response: "No Response",
    marked_unreachable: "Marked Unreachable",
    callback_scheduled: "Callback Scheduled",
    attempt_call: "Call Attempt",
    attempt_whatsapp: "WhatsApp Attempt",
    attempt_email: "Email Attempt",
  };
  return map[action] ?? action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["Admin", "Manager"].includes(session.user.role ?? ""))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const actorId = searchParams.get("actor_id") ?? "";
    const action = searchParams.get("action") ?? "";
    const dateFrom = searchParams.get("date_from") ?? "";
    const dateTo = searchParams.get("date_to") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

    const where: Prisma.ActivityWhereInput = {
      entity_type: "Lead",
    };

    if (actorId && actorId !== "all") where.actor_id = actorId;
    if (action && action !== "all") where.action = action;
    if (dateFrom || dateTo) {
      where.created_at = {};
      if (dateFrom) where.created_at.gte = new Date(dateFrom + "T00:00:00");
      if (dateTo) where.created_at.lte = new Date(dateTo + "T23:59:59");
    }

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        include: { actor: { select: { id: true, name: true } } },
        orderBy: { created_at: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.activity.count({ where }),
    ]);

    // Batch-fetch lead labels
    const leadIds = [...new Set(activities.map((a) => a.entity_id))];
    const leads = leadIds.length > 0
      ? await prisma.lead.findMany({
          where: { id: { in: leadIds } },
          select: { id: true, lead_number: true, full_name: true },
        })
      : [];
    const leadMap = new Map(leads.map((l) => [l.id, l]));

    // Summary stats
    const uniqueLeads = new Set(activities.map((a) => a.entity_id)).size;
    const uniqueAgents = new Set(activities.map((a) => a.actor_id)).size;
    const actionBreakdown: Record<string, number> = {};
    for (const a of activities) {
      actionBreakdown[a.action] = (actionBreakdown[a.action] ?? 0) + 1;
    }

    const rows = activities.map((a) => {
      const meta = (a.metadata ?? {}) as Meta;
      const lead = leadMap.get(a.entity_id);
      const stages = extractStage(meta);
      const notes = extractNotes(a.action, meta);

      return {
        id: a.id,
        time: a.created_at.toISOString(),
        lead_id: a.entity_id,
        lead_name: lead?.full_name ?? "—",
        lead_number: lead?.lead_number ?? "—",
        action: a.action,
        action_label: actionLabel(a.action),
        pipeline_from: stages.pipeline_from,
        pipeline_to: stages.pipeline_to,
        activity_from: stages.activity_from,
        activity_to: stages.activity_to,
        notes,
        actor_id: a.actor_id,
        actor_name: a.actor.name,
      };
    });

    return NextResponse.json({
      data: rows,
      summary: {
        total_activities: total,
        unique_leads: uniqueLeads,
        unique_agents: uniqueAgents,
        action_breakdown: actionBreakdown,
      },
      pagination: { page, page_size: PAGE_SIZE, total, pages: Math.ceil(total / PAGE_SIZE) },
    });
  } catch (error) {
    console.error("GET /api/reports/daily-activity:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
