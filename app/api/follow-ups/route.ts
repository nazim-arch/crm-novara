import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const createFollowUpSchema = z.object({
  lead_id: z.string().min(1).optional(),
  task_id: z.string().min(1).optional(),
  type: z.enum(["Call", "Email", "WhatsApp", "Visit", "Meeting"]),
  scheduled_at: z.string().min(1),
  notes: z.string().optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("lead_id");
  const taskId = searchParams.get("task_id");
  const filter = searchParams.get("filter"); // "today" | "overdue" | "upcoming"

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = {
    completed_at: null,
    ...(leadId && { lead_id: leadId }),
    ...(taskId && { task_id: taskId }),
  };

  if (filter === "today") {
    where.scheduled_at = { gte: startOfToday, lt: endOfToday };
  } else if (filter === "overdue") {
    where.scheduled_at = { lt: startOfToday };
  } else if (filter === "upcoming") {
    where.scheduled_at = { gte: endOfToday };
  }

  const followUps = await prisma.followUp.findMany({
    where,
    include: {
      lead: { select: { id: true, lead_number: true, full_name: true, status: true } },
      task: { select: { id: true, task_number: true, title: true, status: true } },
      created_by: { select: { id: true, name: true } },
    },
    orderBy: { scheduled_at: "asc" },
    take: 100,
  });

  return NextResponse.json({ data: followUps });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createFollowUpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const { lead_id, task_id, type, scheduled_at, notes } = parsed.data;

  // Verify the referenced entity exists
  if (lead_id) {
    const lead = await prisma.lead.findUnique({ where: { id: lead_id, deleted_at: null } });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (task_id) {
    const task = await prisma.task.findUnique({ where: { id: task_id, deleted_at: null } });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const followUp = await prisma.followUp.create({
    data: {
      lead_id: lead_id || undefined,
      task_id: task_id || undefined,
      type,
      scheduled_at: new Date(scheduled_at),
      notes,
      created_by_id: session.user.id,
    },
    include: {
      lead: { select: { id: true, lead_number: true, full_name: true } },
      task: { select: { id: true, task_number: true, title: true } },
    },
  });

  // If linked to a lead, update lead's next_followup_date if this is sooner
  if (lead_id) {
    const lead = await prisma.lead.findUnique({ where: { id: lead_id } });
    if (lead) {
      const scheduledDate = new Date(scheduled_at);
      if (!lead.next_followup_date || scheduledDate < lead.next_followup_date) {
        await prisma.lead.update({
          where: { id: lead_id },
          data: { next_followup_date: scheduledDate, followup_type: type },
        });
      }
    }
  }

  return NextResponse.json({ data: followUp }, { status: 201 });
}
