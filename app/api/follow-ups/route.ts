import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

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
  const isScoped = role === "Sales" || role === "Operations";

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
    where.completed_at = { not: null };
  } else if (status === "pending") {
    where.completed_at = null;
    where.scheduled_at = { gte: startOfToday };
  } else if (status === "overdue") {
    where.completed_at = null;
    where.scheduled_at = { lt: startOfToday };
  }

  const followUps = await prisma.followUp.findMany({
    where,
    include: {
      lead: { select: { id: true, lead_number: true, full_name: true, status: true, temperature: true } },
      opportunity: { select: { id: true, opp_number: true, name: true } },
      task: { select: { id: true, task_number: true, title: true } },
      assigned_to: { select: { id: true, name: true } },
      created_by: { select: { id: true, name: true } },
    },
    orderBy: { scheduled_at: "asc" },
    take: 500,
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

  const followUp = await prisma.followUp.create({
    data: {
      lead_id: lead_id ?? null,
      opportunity_id: opportunity_id ?? null,
      task_id: task_id ?? null,
      assigned_to_id: assigned_to_id ?? null,
      type,
      priority,
      scheduled_at: new Date(scheduled_at),
      notes,
      created_by_id: session.user.id,
    },
    include: {
      lead: { select: { id: true, lead_number: true, full_name: true } },
      opportunity: { select: { id: true, opp_number: true, name: true } },
      assigned_to: { select: { id: true, name: true } },
    },
  });

  // Sync lead's next_followup_date if linked to a lead
  if (lead_id) {
    const lead = await prisma.lead.findUnique({ where: { id: lead_id } });
    if (lead) {
      const scheduledDate = new Date(scheduled_at);
      if (!lead.next_followup_date || scheduledDate < lead.next_followup_date) {
        await prisma.lead.update({
          where: { id: lead_id },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { next_followup_date: scheduledDate, followup_type: type as any },
        });
      }
    }
  }

  return NextResponse.json({ data: followUp }, { status: 201 });
}
