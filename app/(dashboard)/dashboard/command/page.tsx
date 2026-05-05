import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { leadScopeFilter } from "@/lib/rbac";
import { startOfDay, endOfDay, addDays, subDays, subHours, differenceInCalendarDays } from "date-fns";
import type { ActionItem } from "@/lib/command-center-types";
import { CommandCenterClient } from "@/components/dashboard/CommandCenterClient";

export default async function CommandCenterPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "Operations") redirect("/tasks");

  const userId = session.user.id;
  const role = session.user.role;

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const threeDaysEnd = endOfDay(addDays(now, 3));
  const staleThreshold = subDays(todayStart, 7);
  const hotStaleThreshold = subHours(now, 48);

  const leadScope = leadScopeFilter(role, userId);
  const fuWhere =
    role === "Sales" || role === "Operations"
      ? { OR: [{ assigned_to_id: userId }, { created_by_id: userId }] }
      : {};
  const taskWhere =
    role === "Sales" || role === "Operations"
      ? { assigned_to_id: userId }
      : {};
  // Attention-leads OR conditions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attentionOr: any[] = [
    { created_at: { gte: todayStart } },
    { temperature: "Hot", updated_at: { lt: hotStaleThreshold } },
    { temperature: "Warm", OR: [{ next_followup_date: null }, { next_followup_date: { lt: todayStart } }] },
    { updated_at: { lt: staleThreshold } },
    { followups: { none: {} }, stage_history: { none: { from_stage: { not: null } } } },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attentionWhere: any = leadScope
    ? { deleted_at: null, status: { notIn: ["Won", "Lost", "InvalidLead", "Recycle"] }, AND: [leadScope, { OR: attentionOr }] }
    : { deleted_at: null, status: { notIn: ["Won", "Lost", "InvalidLead", "Recycle"] }, OR: attentionOr };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fuScopeWhere: any = { completed_at: null, scheduled_at: { lte: threeDaysEnd }, ...fuWhere };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taskScopeWhere: any = {
    deleted_at: null,
    status: { notIn: ["Done", "Cancelled"] },
    due_date: { lte: threeDaysEnd },
    ...taskWhere,
  };

  const [followUps, tasks, attentionLeads] = await Promise.all([
    // ── Pending follow-ups: overdue or due in next 3 days ─────────────────
    prisma.followUp.findMany({
      where: fuScopeWhere,
      include: {
        lead: {
          select: {
            id: true, lead_number: true, full_name: true, phone: true,
            temperature: true, status: true, potential_lead_value: true,
          },
        },
        opportunity: { select: { id: true, name: true } },
        assigned_to: { select: { id: true, name: true } },
      },
      orderBy: { scheduled_at: "asc" },
      take: 200,
    }),

    // ── Active tasks: overdue or due in next 3 days ────────────────────────
    prisma.task.findMany({
      where: taskScopeWhere,
      include: {
        lead: {
          select: {
            id: true, lead_number: true, full_name: true, phone: true,
            temperature: true, status: true, potential_lead_value: true,
          },
        },
        opportunity: { select: { id: true, name: true } },
        assigned_to: { select: { id: true, name: true } },
      },
      orderBy: { due_date: "asc" },
      take: 100,
    }),

    // ── Leads needing attention (no existing follow-up covers them) ────────
    prisma.lead.findMany({
      where: attentionWhere,
      select: {
        id: true, lead_number: true, full_name: true, phone: true,
        temperature: true, status: true, potential_lead_value: true,
        updated_at: true, created_at: true, next_followup_date: true,
        assigned_to: { select: { id: true, name: true } },
        opportunities: {
          select: { opportunity: { select: { id: true, name: true } } },
          take: 1,
          orderBy: { tagged_at: "desc" },
        },
      },
      orderBy: { updated_at: "asc" },
      take: 100,
    }),
  ]);

  // ── Lead IDs already represented by a pending follow-up ──────────────────
  const fuLeadIds = new Set(
    followUps.map((f) => f.lead_id).filter((id): id is string => id !== null)
  );

  // ── Map follow-ups → ActionItems ─────────────────────────────────────────
  const fuActions: ActionItem[] = followUps.map((fu) => {
    const isOverdue = fu.scheduled_at < todayStart;
    const isToday = fu.scheduled_at >= todayStart && fu.scheduled_at <= todayEnd;
    const overdueDays = isOverdue ? differenceInCalendarDays(todayStart, fu.scheduled_at) : 0;
    const tempBonus =
      fu.lead?.temperature === "Hot" ? 12 : fu.lead?.temperature === "Warm" ? 5 : 0;
    const base = isOverdue ? 80 : isToday ? 60 : 20;
    const score = Math.min(100, base + tempBonus + Math.min(overdueDays * 2, 15));
    const section =
      score >= 60 ? "urgent" : score >= 45 ? "today" : score >= 25 ? "pipeline" : "upcoming";

    return {
      id: `fu_${fu.id}`,
      source: "followup",
      sourceId: fu.id,
      actionType: fu.type,
      section,
      priorityScore: score,
      overdueDays,
      dueAt: fu.scheduled_at.toISOString(),
      lead: fu.lead
        ? { ...fu.lead, potential_lead_value: fu.lead.potential_lead_value ? Number(fu.lead.potential_lead_value) : null }
        : null,
      opportunity: fu.opportunity,
      taskId: fu.task_id ?? null,
      taskTitle: null,
      taskStatus: null,
      taskPriority: null,
      context: fu.outcome ?? fu.notes ?? null,
      reason: isOverdue
        ? `Overdue follow-up (${overdueDays}d)`
        : isToday
        ? "Follow-up today"
        : "Upcoming follow-up",
      assignedToName: fu.assigned_to?.name ?? session.user.name ?? "You",
      assignedToId: fu.assigned_to?.id ?? session.user.id,
    } satisfies ActionItem;
  });

  // ── Map tasks → ActionItems ───────────────────────────────────────────────
  const TASK_PRIO_BASE: Record<string, number> = {
    Critical: 75, High: 68, Medium: 58, Low: 50,
  };
  const taskActions: ActionItem[] = tasks.map((task) => {
    const isOverdue = task.due_date < todayStart;
    const isToday = task.due_date >= todayStart && task.due_date <= todayEnd;
    const overdueDays = isOverdue ? differenceInCalendarDays(todayStart, task.due_date) : 0;
    const tempBonus =
      task.lead?.temperature === "Hot" ? 10 : task.lead?.temperature === "Warm" ? 4 : 0;
    const prioBase = TASK_PRIO_BASE[task.priority] ?? 58;
    const base = isOverdue ? prioBase : isToday ? prioBase - 5 : 15;
    const score = Math.min(100, base + tempBonus + Math.min(overdueDays * 2, 15));
    const section =
      score >= 60 ? "urgent" : score >= 45 ? "today" : score >= 25 ? "pipeline" : "upcoming";

    return {
      id: `task_${task.id}`,
      source: "task",
      sourceId: task.id,
      actionType: "Task",
      section,
      priorityScore: score,
      overdueDays,
      dueAt: task.due_date.toISOString(),
      lead: task.lead
        ? { ...task.lead, potential_lead_value: task.lead.potential_lead_value ? Number(task.lead.potential_lead_value) : null }
        : null,
      opportunity: task.opportunity,
      taskId: task.id,
      taskTitle: task.title,
      taskStatus: task.status,
      taskPriority: task.priority,
      context: task.notes ?? task.description ?? null,
      reason: isOverdue
        ? `Overdue task (${overdueDays}d)`
        : isToday
        ? "Task due today"
        : "Upcoming task",
      assignedToName: task.assigned_to.name,
      assignedToId: task.assigned_to.id,
    } satisfies ActionItem;
  });

  // ── Map attention leads → ActionItems (only uncovered) ───────────────────
  const leadActions: ActionItem[] = attentionLeads
    .filter((lead) => !fuLeadIds.has(lead.id))
    .map((lead) => {
      const isNewToday = lead.created_at >= todayStart;
      const isHotStale =
        lead.temperature === "Hot" && lead.updated_at < hotStaleThreshold;
      const isStale = lead.updated_at < staleThreshold;
      const staleDays = isStale
        ? differenceInCalendarDays(todayStart, lead.updated_at)
        : 0;
      const tempBonus =
        lead.temperature === "Hot" ? 12 : lead.temperature === "Warm" ? 5 : 0;

      let base = 28;
      let reason = "Needs attention";

      if (isNewToday) {
        base = 48;
        reason = "New lead today — first contact needed";
      } else if (isHotStale) {
        base = 62;
        reason = "Hot lead — no action 48h+";
      } else if (isStale && lead.temperature === "Hot") {
        base = 45;
        reason = `Stale Hot lead (${staleDays}d)`;
      } else if (isStale && lead.temperature === "Warm") {
        base = 32;
        reason = `Stale Warm lead (${staleDays}d)`;
      } else if (isStale) {
        base = 28;
        reason = `Stale lead (${staleDays}d)`;
      } else if (lead.temperature === "Warm") {
        base = 35;
        reason = "Warm lead needs follow-up";
      }

      const score = Math.min(100, base + tempBonus);
      const section =
        score >= 60 ? "urgent" : score >= 45 ? "today" : score >= 25 ? "pipeline" : "upcoming";

      return {
        id: `lead_${lead.id}`,
        source: "lead",
        sourceId: lead.id,
        actionType: "Call",
        section,
        priorityScore: score,
        overdueDays: staleDays,
        dueAt: null,
        lead: {
          id: lead.id,
          lead_number: lead.lead_number,
          full_name: lead.full_name,
          phone: lead.phone,
          temperature: lead.temperature,
          status: lead.status,
          potential_lead_value: lead.potential_lead_value
            ? Number(lead.potential_lead_value)
            : null,
        },
        opportunity: lead.opportunities[0]?.opportunity ?? null,
        taskId: null,
        taskTitle: null,
        taskStatus: null,
        taskPriority: null,
        context: null,
        reason,
        assignedToName: lead.assigned_to.name,
        assignedToId: lead.assigned_to.id,
      } satisfies ActionItem;
    });

  const allActions = [...fuActions, ...taskActions, ...leadActions].sort(
    (a, b) => b.priorityScore - a.priorityScore
  );

  return (
    <CommandCenterClient
      actions={allActions}
      agentName={session.user.name ?? "Agent"}
      userId={userId}
      userRole={role}
    />
  );
}
