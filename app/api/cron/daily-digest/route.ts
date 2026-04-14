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
  const yesterday = startOfDay(subDays(today, 1));

  const results = { followUpsDue: 0, followUpsOverdue: 0, tasksOverdue: 0, hotLeadsStale: 0 };

  // Follow-ups due today → notify assigned users
  const dueFollowUps = await prisma.lead.findMany({
    where: {
      deleted_at: null,
      next_followup_date: { gte: todayStart, lte: todayEnd },
    },
    select: { id: true, full_name: true, lead_number: true, assigned_to_id: true },
  });

  for (const lead of dueFollowUps) {
    await prisma.notification.create({
      data: {
        user_id: lead.assigned_to_id,
        type: "FollowUpDue",
        message: `Follow-up due today: ${lead.full_name} (${lead.lead_number})`,
        entity_type: "Lead",
        entity_id: lead.id,
      },
    });
    notifyFollowUpDueToday({
      assignedToId: lead.assigned_to_id,
      leadId: lead.id,
      leadName: lead.full_name,
      leadNumber: lead.lead_number,
    });
    results.followUpsDue++;
  }

  // Overdue follow-ups → notify assigned users
  const overdueFollowUps = await prisma.lead.findMany({
    where: {
      deleted_at: null,
      next_followup_date: { lt: todayStart },
      status: { notIn: ["Won", "Lost", "OnHold"] },
    },
    select: { id: true, full_name: true, lead_number: true, assigned_to_id: true },
    take: 50,
  });

  for (const lead of overdueFollowUps) {
    await prisma.notification.create({
      data: {
        user_id: lead.assigned_to_id,
        type: "FollowUpOverdue",
        message: `Overdue follow-up: ${lead.full_name} (${lead.lead_number})`,
        entity_type: "Lead",
        entity_id: lead.id,
      },
    });
    notifyFollowUpOverdue({
      assignedToId: lead.assigned_to_id,
      leadId: lead.id,
      leadName: lead.full_name,
      leadNumber: lead.lead_number,
    });
    results.followUpsOverdue++;
  }

  // Overdue tasks → notify assigned users
  const overdueTasks = await prisma.task.findMany({
    where: {
      deleted_at: null,
      due_date: { lt: todayStart },
      status: { notIn: ["Done", "Cancelled"] },
    },
    select: { id: true, title: true, task_number: true, assigned_to_id: true, due_date: true, lead: { select: { full_name: true } } },
    take: 50,
  });

  for (const task of overdueTasks) {
    await prisma.notification.create({
      data: {
        user_id: task.assigned_to_id,
        type: "TaskOverdue",
        message: `Overdue task: ${task.title} (${task.task_number})`,
        entity_type: "Task",
        entity_id: task.id,
      },
    });
    notifyTaskOverdue({
      assignedToId: task.assigned_to_id,
      taskId: task.id,
      taskTitle: task.title,
      taskNumber: task.task_number,
      dueDate: task.due_date!,
      leadName: task.lead?.full_name ?? null,
    });
    results.tasksOverdue++;
  }

  // Hot leads stale for 2+ days (no last_contact_date update)
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

  for (const lead of staleHotLeads) {
    await prisma.notification.create({
      data: {
        user_id: lead.assigned_to_id,
        type: "HotLeadStale",
        message: `Hot lead needs attention: ${lead.full_name} (${lead.lead_number})`,
        entity_type: "Lead",
        entity_id: lead.id,
      },
    });
    notifyHotLeadStale({
      assignedToId: lead.assigned_to_id,
      leadId: lead.id,
      leadName: lead.full_name,
      leadNumber: lead.lead_number,
    });
    results.hotLeadsStale++;
  }

  return NextResponse.json({ data: results });
}
