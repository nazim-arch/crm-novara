import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const PAGE_SIZE = 50;

type Meta = Record<string, unknown>;

function extractValues(
  action: string,
  meta: Meta
): { oldValue: string; newValue: string } {
  switch (action) {
    case "stage_changed":
      return {
        oldValue: String(meta.pipeline_from ?? "—"),
        newValue: String(meta.pipeline_to ?? "—"),
      };
    case "activity_stage_changed":
      return {
        oldValue: String(meta.activity_from ?? "—"),
        newValue: String(meta.activity_to ?? "—"),
      };
    case "note_added":
      return {
        oldValue: "—",
        newValue: meta.preview ? `"${String(meta.preview).slice(0, 80)}"` : "Note",
      };
    case "lead_updated":
    case "task_updated": {
      const fields = Array.isArray(meta.fields)
        ? (meta.fields as string[]).join(", ")
        : "—";
      const prefix = meta.source === "excel_bulk_update" ? "[Excel] " : "";
      return { oldValue: "—", newValue: `${prefix}${fields}` };
    }
    case "lead_created":
    case "task_created":
      return { oldValue: "—", newValue: "Created" };
    case "opportunity_tagged":
      return {
        oldValue: "—",
        newValue: meta.opp_number
          ? `${meta.opp_number} – ${meta.opportunity_name ?? ""}`
          : String(meta.opportunity_name ?? "—"),
      };
    case "followup_completed":
      return {
        oldValue: "—",
        newValue: String(meta.outcome ?? "Completed"),
      };
    case "no_response": {
      const v = meta.callback_at
        ? `Callback: ${new Date(String(meta.callback_at)).toLocaleString("en-IN")}`
        : meta.next_date
        ? `Next: ${String(meta.next_date)}`
        : "No Response";
      return { oldValue: "—", newValue: v };
    }
    case "marked_unreachable":
      return { oldValue: "—", newValue: "Marked Unreachable" };
    case "callback_scheduled":
      return {
        oldValue: "—",
        newValue: meta.callback_at
          ? `Callback: ${new Date(String(meta.callback_at)).toLocaleString("en-IN")}`
          : "Callback Scheduled",
      };
    case "attempt_call":
      return { oldValue: "—", newValue: "Attempted: Call" };
    case "attempt_whatsapp":
      return { oldValue: "—", newValue: "Attempted: WhatsApp" };
    case "attempt_email":
      return { oldValue: "—", newValue: "Attempted: Email" };
    case "user_created":
      return { oldValue: "—", newValue: "User Created" };
    case "user_updated": {
      const fields = Array.isArray(meta.fields)
        ? (meta.fields as string[]).join(", ")
        : "—";
      return { oldValue: "—", newValue: fields };
    }
    default:
      return { oldValue: "—", newValue: "—" };
  }
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    stage_changed: "Stage Changed",
    activity_stage_changed: "Activity Stage Changed",
    note_added: "Note Added",
    lead_updated: "Lead Updated",
    lead_created: "Lead Created",
    task_updated: "Task Updated",
    task_created: "Task Created",
    opportunity_tagged: "Opportunity Tagged",
    followup_completed: "Follow-up Completed",
    no_response: "No Response",
    marked_unreachable: "Marked Unreachable",
    callback_scheduled: "Callback Scheduled",
    attempt_call: "Call Attempt",
    attempt_whatsapp: "WhatsApp Attempt",
    attempt_email: "Email Attempt",
    user_created: "User Created",
    user_updated: "User Updated",
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
    const entityType = searchParams.get("entity_type") ?? "";
    const actorId = searchParams.get("actor_id") ?? "";
    const action = searchParams.get("action") ?? "";
    const dateFrom = searchParams.get("date_from") ?? "";
    const dateTo = searchParams.get("date_to") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

    const where: Parameters<typeof prisma.activity.findMany>[0]["where"] = {};

    if (entityType && entityType !== "all") {
      where.entity_type = entityType as "Lead" | "Opportunity" | "Task" | "User";
    }
    if (actorId && actorId !== "all") {
      where.actor_id = actorId;
    }
    if (action && action !== "all") {
      where.action = action;
    }
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

    // Batch-fetch entity labels
    const leadIds = activities.filter((a) => a.entity_type === "Lead").map((a) => a.entity_id);
    const oppIds = activities.filter((a) => a.entity_type === "Opportunity").map((a) => a.entity_id);
    const taskIds = activities.filter((a) => a.entity_type === "Task").map((a) => a.entity_id);
    const userIds = activities.filter((a) => a.entity_type === "User").map((a) => a.entity_id);

    const [leads, opps, tasks, users] = await Promise.all([
      leadIds.length > 0
        ? prisma.lead.findMany({
            where: { id: { in: leadIds } },
            select: { id: true, lead_number: true, full_name: true },
          })
        : Promise.resolve([]),
      oppIds.length > 0
        ? prisma.opportunity.findMany({
            where: { id: { in: oppIds } },
            select: { id: true, opp_number: true, name: true },
          })
        : Promise.resolve([]),
      taskIds.length > 0
        ? prisma.task.findMany({
            where: { id: { in: taskIds } },
            select: { id: true, task_number: true, title: true },
          })
        : Promise.resolve([]),
      userIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const leadMap = new Map(leads.map((l) => [l.id, l]));
    const oppMap = new Map(opps.map((o) => [o.id, o]));
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const userMap = new Map(users.map((u) => [u.id, u]));

    const rows = activities.map((a) => {
      const meta = (a.metadata ?? {}) as Meta;
      const { oldValue, newValue } = extractValues(a.action, meta);

      let entityLabel = a.entity_id;
      let entityHref = "#";

      if (a.entity_type === "Lead") {
        const l = leadMap.get(a.entity_id);
        if (l) { entityLabel = `${l.lead_number} – ${l.full_name}`; entityHref = `/leads/${l.id}`; }
      } else if (a.entity_type === "Opportunity") {
        const o = oppMap.get(a.entity_id);
        if (o) { entityLabel = `${o.opp_number} – ${o.name}`; entityHref = `/opportunities/${o.id}`; }
      } else if (a.entity_type === "Task") {
        const t = taskMap.get(a.entity_id);
        if (t) { entityLabel = `${t.task_number} – ${t.title}`; entityHref = `/tasks/${t.id}`; }
      } else if (a.entity_type === "User") {
        const u = userMap.get(a.entity_id);
        if (u) { entityLabel = u.name; entityHref = `/settings/users`; }
      }

      return {
        id: a.id,
        source: a.entity_type,
        entity_id: a.entity_id,
        entity_label: entityLabel,
        entity_href: entityHref,
        action: a.action,
        action_label: actionLabel(a.action),
        old_value: oldValue,
        new_value: newValue,
        actor_id: a.actor_id,
        actor_name: a.actor.name,
        changed_at: a.created_at.toISOString(),
      };
    });

    return NextResponse.json({
      data: rows,
      pagination: { page, page_size: PAGE_SIZE, total, pages: Math.ceil(total / PAGE_SIZE) },
    });
  } catch (error) {
    console.error("GET /api/reports/audit-log:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
