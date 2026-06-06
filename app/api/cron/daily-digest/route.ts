import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { startOfDay, endOfDay, subDays } from "date-fns";
import {
  notifyFollowUpDueToday,
  notifyFollowUpOverdue,
  notifyTaskOverdue,
  notifyHotLeadStale,
} from "@/lib/email-notifications";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  const results = { followUpsDue: 0, followUpsOverdue: 0, tasksOverdue: 0, hotLeadsStale: 0 };

  // ── Follow-ups due today ─────────────────────────────────────────────────────

  const dueFollowUps = await prisma.lead.findMany({
    where: {
      deleted_at: null,
      next_followup_date: { gte: todayStart, lte: todayEnd },
    },
    select: { id: true, full_name: true, lead_number: true, assigned_to_id: true },
  });

  if (dueFollowUps.length > 0) {
    await prisma.notification.createMany({
      data: dueFollowUps.map((lead) => ({
        user_id: lead.assigned_to_id,
        type: "FollowUpDue" as const,
        message: `Follow-up due today: ${lead.full_name} (${lead.lead_number})`,
        entity_type: "Lead" as const,
        entity_id: lead.id,
      })),
      skipDuplicates: true,
    });
    await Promise.all(
      dueFollowUps.map((lead) =>
        notifyFollowUpDueToday({
          assignedToId: lead.assigned_to_id,
          leadId: lead.id,
          leadName: lead.full_name,
          leadNumber: lead.lead_number,
        })
      )
    );
    results.followUpsDue = dueFollowUps.length;
  }

  // ── Overdue follow-ups ───────────────────────────────────────────────────────

  const overdueFollowUps = await prisma.lead.findMany({
    where: {
      deleted_at: null,
      next_followup_date: { lt: todayStart },
      status: { notIn: ["Won", "Lost", "OnHold"] },
    },
    select: { id: true, full_name: true, lead_number: true, assigned_to_id: true },
    take: 50,
  });

  if (overdueFollowUps.length > 0) {
    await prisma.notification.createMany({
      data: overdueFollowUps.map((lead) => ({
        user_id: lead.assigned_to_id,
        type: "FollowUpOverdue" as const,
        message: `Overdue follow-up: ${lead.full_name} (${lead.lead_number})`,
        entity_type: "Lead" as const,
        entity_id: lead.id,
      })),
      skipDuplicates: true,
    });
    await Promise.all(
      overdueFollowUps.map((lead) =>
        notifyFollowUpOverdue({
          assignedToId: lead.assigned_to_id,
          leadId: lead.id,
          leadName: lead.full_name,
          leadNumber: lead.lead_number,
        })
      )
    );
    results.followUpsOverdue = overdueFollowUps.length;
  }

  // ── Overdue tasks ────────────────────────────────────────────────────────────

  const overdueTasks = await prisma.task.findMany({
    where: {
      deleted_at: null,
      due_date: { lt: todayStart },
      status: { notIn: ["Done", "Cancelled"] },
    },
    select: { id: true, title: true, task_number: true, assigned_to_id: true, due_date: true, lead: { select: { full_name: true } } },
    take: 50,
  });

  if (overdueTasks.length > 0) {
    await prisma.notification.createMany({
      data: overdueTasks.map((task) => ({
        user_id: task.assigned_to_id,
        type: "TaskOverdue" as const,
        message: `Overdue task: ${task.title} (${task.task_number})`,
        entity_type: "Task" as const,
        entity_id: task.id,
      })),
      skipDuplicates: true,
    });
    await Promise.all(
      overdueTasks.map((task) =>
        notifyTaskOverdue({
          assignedToId: task.assigned_to_id,
          taskId: task.id,
          taskTitle: task.title,
          taskNumber: task.task_number,
          dueDate: task.due_date!,
          leadName: task.lead?.full_name ?? null,
        })
      )
    );
    results.tasksOverdue = overdueTasks.length;
  }

  // ── Hot leads stale for 2+ days ──────────────────────────────────────────────

  const staleHotLeads = await prisma.lead.findMany({
    where: {
      deleted_at: null,
      temperature: "Hot",
      OR: [
        { last_contact_date: null },
        { last_contact_date: { lt: subDays(today, 2) } },
      ],
      status: { notIn: ["Won", "Lost", "OnHold"] },
    },
    select: { id: true, full_name: true, lead_number: true, assigned_to_id: true },
    take: 20,
  });

  if (staleHotLeads.length > 0) {
    await prisma.notification.createMany({
      data: staleHotLeads.map((lead) => ({
        user_id: lead.assigned_to_id,
        type: "HotLeadStale" as const,
        message: `Hot lead needs attention: ${lead.full_name} (${lead.lead_number})`,
        entity_type: "Lead" as const,
        entity_id: lead.id,
      })),
      skipDuplicates: true,
    });
    await Promise.all(
      staleHotLeads.map((lead) =>
        notifyHotLeadStale({
          assignedToId: lead.assigned_to_id,
          leadId: lead.id,
          leadName: lead.full_name,
          leadNumber: lead.lead_number,
        })
      )
    );
    results.hotLeadsStale = staleHotLeads.length;
  }

  return NextResponse.json({ data: results });
}
