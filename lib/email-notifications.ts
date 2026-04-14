/**
 * High-level email notification helpers.
 * Each function resolves the recipient's email from the DB, then sends.
 * All sends are fire-and-forget — errors are logged but never thrown to callers.
 */
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import * as T from '@/lib/email-templates';

async function userEmail(userId: string): Promise<{ email: string; name: string } | null> {
  return prisma.user.findUnique({
    where: { id: userId, is_active: true },
    select: { email: true, name: true },
  });
}

async function adminEmails(): Promise<{ id: string; email: string; name: string }[]> {
  return prisma.user.findMany({
    where: { role: 'Admin', is_active: true },
    select: { id: true, email: true, name: true },
  });
}

function fire(promise: Promise<unknown>) {
  promise.catch((err) => console.error('[email-notifications]', err));
}

// ── Leads ─────────────────────────────────────────────────────────────────────

export function notifyLeadAssigned(params: {
  assignedToId: string;
  leadId: string;
  leadName: string;
  leadNumber: string;
  phone: string;
  source: string;
  createdByName: string;
}) {
  fire((async () => {
    const user = await userEmail(params.assignedToId);
    if (!user) return;
    const tpl = T.leadAssigned({
      recipientName: user.name,
      leadName: params.leadName,
      leadNumber: params.leadNumber,
      leadId: params.leadId,
      createdBy: params.createdByName,
      phone: params.phone,
      source: params.source,
    });
    await sendEmail({ to: user.email, ...tpl });
  })());
}

export function notifyLeadCreatedAdmins(params: {
  excludeId: string;
  leadId: string;
  leadName: string;
  leadNumber: string;
  source: string;
  createdByName: string;
  assignedToName: string;
}) {
  fire((async () => {
    const admins = (await adminEmails()).filter((a) => a.id !== params.excludeId);
    await Promise.all(admins.map((admin) => {
      const tpl = T.leadCreatedAdmin({
        adminName: admin.name,
        leadName: params.leadName,
        leadNumber: params.leadNumber,
        leadId: params.leadId,
        createdBy: params.createdByName,
        assignedTo: params.assignedToName,
        source: params.source,
      });
      return sendEmail({ to: admin.email, ...tpl });
    }));
  })());
}

export function notifyLeadReassigned(params: {
  newAssigneeId: string;
  leadId: string;
  leadName: string;
  leadNumber: string;
  reassignedByName: string;
}) {
  fire((async () => {
    const user = await userEmail(params.newAssigneeId);
    if (!user) return;
    const tpl = T.leadReassigned({
      recipientName: user.name,
      leadName: params.leadName,
      leadNumber: params.leadNumber,
      leadId: params.leadId,
      reassignedBy: params.reassignedByName,
    });
    await sendEmail({ to: user.email, ...tpl });
  })());
}

export function notifyLeadStageChanged(params: {
  assignedToId: string;
  leadId: string;
  leadName: string;
  leadNumber: string;
  fromStage: string;
  toStage: string;
  changedByName: string;
  notes?: string | null;
}) {
  fire((async () => {
    const [assignee, admins] = await Promise.all([
      userEmail(params.assignedToId),
      adminEmails(),
    ]);

    const recipients: { email: string; name: string }[] = [];
    if (assignee) recipients.push(assignee);
    for (const admin of admins) {
      if (!recipients.find((r) => r.email === admin.email)) recipients.push(admin);
    }

    await Promise.all(recipients.map((r) => {
      const tpl = T.leadStageChanged({
        recipientName: r.name,
        leadName: params.leadName,
        leadNumber: params.leadNumber,
        leadId: params.leadId,
        fromStage: params.fromStage,
        toStage: params.toStage,
        changedBy: params.changedByName,
        notes: params.notes,
      });
      return sendEmail({ to: r.email, ...tpl });
    }));
  })());
}

export function notifyLeadWon(params: {
  assignedToId: string;
  leadId: string;
  leadName: string;
  leadNumber: string;
  settlementValue: number;
  commissionPercent: number;
  closedByName: string;
}) {
  fire((async () => {
    const [assignee, admins] = await Promise.all([
      userEmail(params.assignedToId),
      adminEmails(),
    ]);

    const recipients: { email: string; name: string }[] = [];
    if (assignee) recipients.push(assignee);
    for (const admin of admins) {
      if (!recipients.find((r) => r.email === admin.email)) recipients.push(admin);
    }

    await Promise.all(recipients.map((r) => {
      const tpl = T.leadWon({
        recipientName: r.name,
        leadName: params.leadName,
        leadNumber: params.leadNumber,
        leadId: params.leadId,
        settlementValue: params.settlementValue,
        commissionPercent: params.commissionPercent,
        closedBy: params.closedByName,
      });
      return sendEmail({ to: r.email, ...tpl });
    }));
  })());
}

export function notifyLeadLost(params: {
  assignedToId: string;
  leadId: string;
  leadName: string;
  leadNumber: string;
  lostReason?: string | null;
  markedByName: string;
}) {
  fire((async () => {
    const [assignee, admins] = await Promise.all([
      userEmail(params.assignedToId),
      adminEmails(),
    ]);

    const recipients: { email: string; name: string }[] = [];
    if (assignee) recipients.push(assignee);
    for (const admin of admins) {
      if (!recipients.find((r) => r.email === admin.email)) recipients.push(admin);
    }

    await Promise.all(recipients.map((r) => {
      const tpl = T.leadLost({
        recipientName: r.name,
        leadName: params.leadName,
        leadNumber: params.leadNumber,
        leadId: params.leadId,
        lostReason: params.lostReason,
        markedBy: params.markedByName,
      });
      return sendEmail({ to: r.email, ...tpl });
    }));
  })());
}

// ── Opportunities ─────────────────────────────────────────────────────────────

export function notifyOpportunityCreated(params: {
  createdById: string;
  oppId: string;
  oppName: string;
  oppNumber: string;
  project: string;
  createdByName: string;
  possibleRevenue: number;
}) {
  fire((async () => {
    const admins = await adminEmails();
    await Promise.all(admins.map((admin) => {
      const tpl = T.opportunityCreated({
        recipientName: admin.name,
        oppName: params.oppName,
        oppNumber: params.oppNumber,
        oppId: params.oppId,
        project: params.project,
        createdBy: params.createdByName,
        possibleRevenue: params.possibleRevenue,
      });
      return sendEmail({ to: admin.email, ...tpl });
    }));
  })());
}

export function notifyLeadTaggedToOpportunity(params: {
  leadId: string;
  oppId: string;
  oppName: string;
  oppNumber: string;
  taggedByName: string;
}) {
  fire((async () => {
    const lead = await prisma.lead.findUnique({
      where: { id: params.leadId },
      select: { full_name: true, lead_number: true, assigned_to_id: true },
    });
    if (!lead) return;
    const user = await userEmail(lead.assigned_to_id);
    if (!user) return;
    const tpl = T.leadTaggedToOpportunity({
      recipientName: user.name,
      leadName: lead.full_name,
      leadNumber: lead.lead_number,
      oppName: params.oppName,
      oppNumber: params.oppNumber,
      oppId: params.oppId,
      taggedBy: params.taggedByName,
    });
    await sendEmail({ to: user.email, ...tpl });
  })());
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function notifyTaskAssigned(params: {
  assignedToId: string;
  taskId: string;
  taskTitle: string;
  taskNumber: string;
  priority: string;
  dueDate: Date | null;
  assignedByName: string;
  leadName?: string | null;
}) {
  fire((async () => {
    const user = await userEmail(params.assignedToId);
    if (!user) return;
    const tpl = T.taskAssigned({
      recipientName: user.name,
      taskTitle: params.taskTitle,
      taskNumber: params.taskNumber,
      taskId: params.taskId,
      priority: params.priority,
      dueDate: params.dueDate,
      assignedBy: params.assignedByName,
      leadName: params.leadName,
    });
    await sendEmail({ to: user.email, ...tpl });
  })());
}

export function notifyTaskReassigned(params: {
  newAssigneeId: string;
  taskId: string;
  taskTitle: string;
  taskNumber: string;
  dueDate: Date | null;
  reassignedByName: string;
}) {
  fire((async () => {
    const user = await userEmail(params.newAssigneeId);
    if (!user) return;
    const tpl = T.taskReassigned({
      recipientName: user.name,
      taskTitle: params.taskTitle,
      taskNumber: params.taskNumber,
      taskId: params.taskId,
      dueDate: params.dueDate,
      reassignedBy: params.reassignedByName,
    });
    await sendEmail({ to: user.email, ...tpl });
  })());
}

export function notifyTaskOverdue(params: {
  assignedToId: string;
  taskId: string;
  taskTitle: string;
  taskNumber: string;
  dueDate: Date;
  leadName?: string | null;
}) {
  fire((async () => {
    const user = await userEmail(params.assignedToId);
    if (!user) return;
    const tpl = T.taskOverdue({
      recipientName: user.name,
      taskTitle: params.taskTitle,
      taskNumber: params.taskNumber,
      taskId: params.taskId,
      dueDate: params.dueDate,
      leadName: params.leadName,
    });
    await sendEmail({ to: user.email, ...tpl });
  })());
}

// ── Follow-ups ────────────────────────────────────────────────────────────────

export function notifyFollowUpScheduled(params: {
  assignedToId: string;
  leadId: string;
  leadName: string;
  leadNumber: string;
  type: string;
  scheduledAt: Date;
  scheduledByName: string;
  scheduledById: string;
  notes?: string | null;
}) {
  fire((async () => {
    // Only notify the lead's assigned user if they didn't schedule it themselves
    if (params.assignedToId === params.scheduledById) return;
    const user = await userEmail(params.assignedToId);
    if (!user) return;
    const tpl = T.followUpScheduled({
      recipientName: user.name,
      type: params.type,
      scheduledAt: params.scheduledAt,
      leadName: params.leadName,
      leadId: params.leadId,
      leadNumber: params.leadNumber,
      scheduledBy: params.scheduledByName,
      notes: params.notes,
    });
    await sendEmail({ to: user.email, ...tpl });
  })());
}

export function notifyFollowUpDueToday(params: {
  assignedToId: string;
  leadId: string;
  leadName: string;
  leadNumber: string;
  type?: string;
}) {
  fire((async () => {
    const user = await userEmail(params.assignedToId);
    if (!user) return;
    const tpl = T.followUpDueToday({
      recipientName: user.name,
      leadName: params.leadName,
      leadNumber: params.leadNumber,
      leadId: params.leadId,
      type: params.type,
    });
    await sendEmail({ to: user.email, ...tpl });
  })());
}

export function notifyFollowUpOverdue(params: {
  assignedToId: string;
  leadId: string;
  leadName: string;
  leadNumber: string;
}) {
  fire((async () => {
    const user = await userEmail(params.assignedToId);
    if (!user) return;
    const tpl = T.followUpOverdue({
      recipientName: user.name,
      leadName: params.leadName,
      leadNumber: params.leadNumber,
      leadId: params.leadId,
    });
    await sendEmail({ to: user.email, ...tpl });
  })());
}

export function notifyHotLeadStale(params: {
  assignedToId: string;
  leadId: string;
  leadName: string;
  leadNumber: string;
}) {
  fire((async () => {
    const user = await userEmail(params.assignedToId);
    if (!user) return;
    const tpl = T.hotLeadStale({
      recipientName: user.name,
      leadName: params.leadName,
      leadNumber: params.leadNumber,
      leadId: params.leadId,
    });
    await sendEmail({ to: user.email, ...tpl });
  })());
}
