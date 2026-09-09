/**
 * High-level email notification helpers.
 * Each function resolves the recipient's email from the DB, then sends.
 * All sends are fire-and-forget — errors are logged but never thrown to callers.
 */
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import * as T from '@/lib/email-templates';
import { logger } from '@/lib/logger';

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
  promise.catch((err) => logger.error('email-notifications send failed', { error: String(err) }));
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

/**
 * Fix #5 §5.3 — a restricted user hit a duplicate that resolves to a lead they cannot see. The
 * contact details are withheld from them; Admins (who may see the lead) are told so they can decide
 * whether to release it. Matched lead numbers are safe here because the recipients are Admins.
 */
export function notifyDuplicateRestrictedAdmins(params: {
  actorId: string;
  actorName: string;
  attemptedContact: string;
  matchedLeadNumbers: string[];
}) {
  fire((async () => {
    const admins = (await adminEmails()).filter((a) => a.id !== params.actorId);
    if (admins.length === 0) return;
    const matches = params.matchedLeadNumbers.join(', ') || '(unknown)';
    const subject = `Restricted duplicate attempt by ${params.actorName}`;
    const html =
      `<p><strong>${params.actorName}</strong> attempted to create a lead using ` +
      `<strong>${params.attemptedContact}</strong>, which matches ${params.matchedLeadNumbers.length} ` +
      `hidden lead(s): <strong>${matches}</strong>.</p>` +
      `<p>The contact details were withheld from them. Review whether the lead should be released.</p>`;
    await Promise.all(admins.map((a) => sendEmail({ to: a.email, subject, html })));
  })());
}

/**
 * Fix #5 §6.6 — a Restricted Data Access (guarded) permission was granted to a non-Admin role.
 * Every Admin is told which protection was switched off, for which role, and by whom.
 */
export function notifyRbacGuardedGrant(params: {
  actorId: string;
  actorName: string;
  grants: { role: string; permission: string; label: string }[];
}) {
  fire((async () => {
    const admins = (await adminEmails()).filter((a) => a.id !== params.actorId);
    if (admins.length === 0) return;
    const rows = params.grants
      .map((g) => `<li><strong>${g.label}</strong> → role <strong>${g.role}</strong></li>`)
      .join('');
    const subject = `Restricted Data Access granted by ${params.actorName}`;
    const html =
      `<p><strong>${params.actorName}</strong> granted the following Restricted Data Access ` +
      `permission(s), which turn OFF a lead-visibility protection:</p><ul>${rows}</ul>` +
      `<p>Review whether this is intended and revoke it once the reason has passed.</p>`;
    await Promise.all(admins.map((a) => sendEmail({ to: a.email, subject, html })));
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

// Only notifies the assignee — admins receive dedicated emails for Won/Lost transitions.
// Sending to all admins on every minor transition (New→Prospect, etc.) creates alert fatigue.
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
    const assignee = await userEmail(params.assignedToId);
    if (!assignee) return;
    const tpl = T.leadStageChanged({
      recipientName: assignee.name,
      leadName: params.leadName,
      leadNumber: params.leadNumber,
      leadId: params.leadId,
      fromStage: params.fromStage,
      toStage: params.toStage,
      changedBy: params.changedByName,
      notes: params.notes,
    });
    await sendEmail({ to: assignee.email, ...tpl });
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

// Escalate an overdue high-priority task to a set of oversight recipients
// (typically the assignee's manager + admins). Sends to each unique email once.
export function notifyTaskEscalated(params: {
  recipientIds: string[];
  taskId: string;
  taskTitle: string;
  taskNumber: string;
  priority: string;
  dueDate: Date;
  daysOverdue: number;
  assigneeName: string;
}) {
  fire((async () => {
    const uniqueIds = [...new Set(params.recipientIds)];
    const users = await prisma.user.findMany({
      where: { id: { in: uniqueIds }, is_active: true },
      select: { email: true, name: true },
    });
    const seen = new Set<string>();
    await Promise.all(users.map((u) => {
      if (seen.has(u.email)) return Promise.resolve();
      seen.add(u.email);
      const tpl = T.taskEscalated({
        recipientName: u.name,
        taskTitle: params.taskTitle,
        taskNumber: params.taskNumber,
        taskId: params.taskId,
        priority: params.priority,
        dueDate: params.dueDate,
        daysOverdue: params.daysOverdue,
        assigneeName: params.assigneeName,
      });
      return sendEmail({ to: u.email, ...tpl });
    }));
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
