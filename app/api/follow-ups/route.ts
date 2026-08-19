import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { setActiveFollowUp, FollowUpForbiddenError, NO_FOLLOWUP_STATUSES } from "@/lib/follow-ups";

const FOLLOW_UP_TYPES = ["Call", "Email", "WhatsApp", "Visit", "Meeting", "Activity", "Internal"] as const;

const createFollowUpSchema = z.object({
  lead_id: z.string().min(1).optional(),
  opportunity_id: z.string().min(1).optional(),
  task_id: z.string().min(1).optional(),
  assigned_to_id: z.string().min(1).optional(),
  type: z.enum(FOLLOW_UP_TYPES),
  priority: z.enum(["High", "Medium", "Low"]).default("Medium"),
  scheduled_at: z.string().min(1),
  notes: z.string().optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("lead_id");
  const oppId = searchParams.get("opportunity_id");
  const taskId = searchParams.get("task_id");
  const assignedTo = searchParams.get("assigned_to");
  const status = searchParams.get("status"); // "pending" | "completed" | "overdue"

  const role = session.user.role;
  const isScoped = role === "Sales" || role === "Operations" || role === "TeamLead";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  if (isScoped && !leadId && !oppId && !taskId) {
    where.OR = [
      { assigned_to_id: session.user.id },
      { created_by_id: session.user.id },
    ];
  }

  if (leadId) where.lead_id = leadId;
  if (oppId) where.opportunity_id = oppId;
  if (taskId) where.task_id = taskId;
  if (assignedTo) where.assigned_to_id = assignedTo;

  if (status === "completed") {
    where.status = "Completed";
  } else if (status === "pending") {
    where.status = "Active";
    where.scheduled_at = { gte: startOfToday };
    where.NOT = { lead: { status: { in: [...NO_FOLLOWUP_STATUSES] } } };
  } else if (status === "overdue") {
    where.status = "Active";
    where.scheduled_at = { lt: startOfToday };
    where.NOT = { lead: { status: { in: [...NO_FOLLOWUP_STATUSES] } } };
  }

  const followUps = await prisma.followUp.findMany({
    where,
    include: {
      lead: { select: { id: true, lead_number: true, full_name: true, status: true, temperature: true, _count: { select: { followups: true } } } },
      opportunity: { select: { id: true, opp_number: true, name: true } },
      task: { select: { id: true, task_number: true, title: true } },
      assigned_to: { select: { id: true, name: true } },
      created_by: { select: { id: true, name: true } },
    },
    orderBy: { scheduled_at: "asc" },
    take: 200,
  });

  return NextResponse.json({ data: followUps });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createFollowUpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const { lead_id, opportunity_id, task_id, assigned_to_id, type, priority, scheduled_at, notes } = parsed.data;

  const followUpInclude = {
    lead: { select: { id: true, lead_number: true, full_name: true } },
    opportunity: { select: { id: true, opp_number: true, name: true } },
    assigned_to: { select: { id: true, name: true } },
  };

  // Lead-linked follow-ups funnel through the single-active service (newest scheduling wins,
  // previous active row is superseded, lead mirror stays in sync).
  if (lead_id) {
    try {
      const { created, superseded } = await setActiveFollowUp({
        lead_id,
        scheduled_at: new Date(scheduled_at),
        type,
        priority,
        assigned_to_id: assigned_to_id ?? null,
        created_by_id: session.user.id,
        notes,
        reason: "Scheduled by agent",
      });
      const followUp = await prisma.followUp.findUnique({
        where: { id: created.id },
        include: followUpInclude,
      });
      return NextResponse.json(
        {
          data: followUp,
          superseded: superseded
            ? { id: superseded.id, scheduled_at: superseded.scheduled_at, type: superseded.type }
            : null,
        },
        { status: 201 }
      );
    } catch (err) {
      if (err instanceof FollowUpForbiddenError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }
  }

  // Opportunity/task follow-ups are not subject to the single-active-per-lead rule.
  const followUp = await prisma.followUp.create({
    data: {
      opportunity_id: opportunity_id ?? null,
      task_id: task_id ?? null,
      assigned_to_id: assigned_to_id ?? null,
      type,
      priority,
      scheduled_at: new Date(scheduled_at),
      notes,
      created_by_id: session.user.id,
      status: "Active",
    },
    include: followUpInclude,
  });

  return NextResponse.json({ data: followUp }, { status: 201 });
}
