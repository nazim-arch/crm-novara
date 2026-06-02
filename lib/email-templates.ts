const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://crm.novara.in';

function base(title: string, body: string, ctaLabel?: string, ctaHref?: string): string {
  const cta = ctaLabel && ctaHref
    ? `<a href="${ctaHref}" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#18181b;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">${ctaLabel}</a>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
        <tr>
          <td style="background:#18181b;padding:20px 32px;">
            <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-.3px;">Dealstack</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#18181b;">${title}</h2>
            <div style="font-size:14px;line-height:1.7;color:#52525b;">${body}</div>
            ${cta}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #f4f4f5;">
            <p style="margin:0;font-size:12px;color:#a1a1aa;">You're receiving this because you use Dealstack CRM. Do not reply to this email.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Leads ────────────────────────────────────────────────────────────────────

export function leadAssigned(params: {
  recipientName: string;
  leadName: string;
  leadNumber: string;
  leadId: string;
  createdBy: string;
  phone: string;
  source: string;
}) {
  return {
    subject: `New lead assigned: ${params.leadName} (${params.leadNumber})`,
    html: base(
      'New Lead Assigned to You',
      `Hi ${params.recipientName},<br><br>
      A new lead has been assigned to you by <strong>${params.createdBy}</strong>.<br><br>
      <strong>Name:</strong> ${params.leadName}<br>
      <strong>Lead #:</strong> ${params.leadNumber}<br>
      <strong>Phone:</strong> ${params.phone}<br>
      <strong>Source:</strong> ${params.source}`,
      'View Lead',
      `${APP_URL}/leads/${params.leadId}`,
    ),
  };
}

export function leadCreatedAdmin(params: {
  adminName: string;
  leadName: string;
  leadNumber: string;
  leadId: string;
  createdBy: string;
  assignedTo: string;
  source: string;
}) {
  return {
    subject: `New lead created: ${params.leadName} (${params.leadNumber})`,
    html: base(
      'New Lead Created',
      `Hi ${params.adminName},<br><br>
      A new lead has been created by <strong>${params.createdBy}</strong>.<br><br>
      <strong>Name:</strong> ${params.leadName}<br>
      <strong>Lead #:</strong> ${params.leadNumber}<br>
      <strong>Assigned to:</strong> ${params.assignedTo}<br>
      <strong>Source:</strong> ${params.source}`,
      'View Lead',
      `${APP_URL}/leads/${params.leadId}`,
    ),
  };
}

export function leadReassigned(params: {
  recipientName: string;
  leadName: string;
  leadNumber: string;
  leadId: string;
  reassignedBy: string;
}) {
  return {
    subject: `Lead reassigned to you: ${params.leadName} (${params.leadNumber})`,
    html: base(
      'Lead Reassigned to You',
      `Hi ${params.recipientName},<br><br>
      The lead <strong>${params.leadName} (${params.leadNumber})</strong> has been reassigned to you by <strong>${params.reassignedBy}</strong>.`,
      'View Lead',
      `${APP_URL}/leads/${params.leadId}`,
    ),
  };
}

export function leadStageChanged(params: {
  recipientName: string;
  leadName: string;
  leadNumber: string;
  leadId: string;
  fromStage: string;
  toStage: string;
  changedBy: string;
  notes?: string | null;
}) {
  return {
    subject: `Lead moved to ${params.toStage}: ${params.leadName} (${params.leadNumber})`,
    html: base(
      `Lead Stage Updated → ${params.toStage}`,
      `Hi ${params.recipientName},<br><br>
      <strong>${params.leadName} (${params.leadNumber})</strong> has been moved from <strong>${params.fromStage}</strong> to <strong>${params.toStage}</strong> by ${params.changedBy}.
      ${params.notes ? `<br><br><strong>Notes:</strong> ${params.notes}` : ''}`,
      'View Lead',
      `${APP_URL}/leads/${params.leadId}`,
    ),
  };
}

export function leadWon(params: {
  recipientName: string;
  leadName: string;
  leadNumber: string;
  leadId: string;
  settlementValue: number;
  commissionPercent: number;
  closedBy: string;
}) {
  const commission = (params.settlementValue * params.commissionPercent) / 100;
  return {
    subject: `Deal Won: ${params.leadName} (${params.leadNumber})`,
    html: base(
      '🏆 Deal Won',
      `Hi ${params.recipientName},<br><br>
      Great news! <strong>${params.leadName} (${params.leadNumber})</strong> has been marked as <strong>Won</strong> by ${params.closedBy}.<br><br>
      <strong>Settlement Value:</strong> ₹${params.settlementValue.toLocaleString('en-IN')}<br>
      <strong>Commission (${params.commissionPercent}%):</strong> ₹${commission.toLocaleString('en-IN')}`,
      'View Lead',
      `${APP_URL}/leads/${params.leadId}`,
    ),
  };
}

export function leadLost(params: {
  recipientName: string;
  leadName: string;
  leadNumber: string;
  leadId: string;
  lostReason?: string | null;
  markedBy: string;
}) {
  return {
    subject: `Lead Lost: ${params.leadName} (${params.leadNumber})`,
    html: base(
      'Lead Marked as Lost',
      `Hi ${params.recipientName},<br><br>
      <strong>${params.leadName} (${params.leadNumber})</strong> has been marked as <strong>Lost</strong> by ${params.markedBy}.
      ${params.lostReason ? `<br><br><strong>Reason:</strong> ${params.lostReason}` : ''}`,
      'View Lead',
      `${APP_URL}/leads/${params.leadId}`,
    ),
  };
}

// ── Opportunities ─────────────────────────────────────────────────────────────

export function opportunityCreated(params: {
  recipientName: string;
  oppName: string;
  oppNumber: string;
  oppId: string;
  project: string;
  createdBy: string;
  possibleRevenue: number;
}) {
  return {
    subject: `New opportunity created: ${params.oppName} (${params.oppNumber})`,
    html: base(
      'New Opportunity Created',
      `Hi ${params.recipientName},<br><br>
      A new opportunity has been created by <strong>${params.createdBy}</strong>.<br><br>
      <strong>Name:</strong> ${params.oppName}<br>
      <strong>Opp #:</strong> ${params.oppNumber}<br>
      <strong>Project:</strong> ${params.project}<br>
      <strong>Possible Revenue:</strong> ₹${params.possibleRevenue.toLocaleString('en-IN')}`,
      'View Opportunity',
      `${APP_URL}/opportunities/${params.oppId}`,
    ),
  };
}

export function leadTaggedToOpportunity(params: {
  recipientName: string;
  leadName: string;
  leadNumber: string;
  oppName: string;
  oppNumber: string;
  oppId: string;
  taggedBy: string;
}) {
  return {
    subject: `Your lead tagged to opportunity: ${params.oppName}`,
    html: base(
      'Lead Tagged to Opportunity',
      `Hi ${params.recipientName},<br><br>
      Your lead <strong>${params.leadName} (${params.leadNumber})</strong> has been tagged to opportunity <strong>${params.oppName} (${params.oppNumber})</strong> by ${params.taggedBy}.`,
      'View Opportunity',
      `${APP_URL}/opportunities/${params.oppId}`,
    ),
  };
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function taskAssigned(params: {
  recipientName: string;
  taskTitle: string;
  taskNumber: string;
  taskId: string;
  priority: string;
  dueDate: Date | null;
  assignedBy: string;
  leadName?: string | null;
}) {
  const due = params.dueDate
    ? params.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'No due date';
  return {
    subject: `New task assigned: ${params.taskTitle} (${params.taskNumber})`,
    html: base(
      'New Task Assigned to You',
      `Hi ${params.recipientName},<br><br>
      A task has been assigned to you by <strong>${params.assignedBy}</strong>.<br><br>
      <strong>Task:</strong> ${params.taskTitle}<br>
      <strong>Task #:</strong> ${params.taskNumber}<br>
      <strong>Priority:</strong> ${params.priority}<br>
      <strong>Due:</strong> ${due}
      ${params.leadName ? `<br><strong>Lead:</strong> ${params.leadName}` : ''}`,
      'View Task',
      `${APP_URL}/tasks/${params.taskId}`,
    ),
  };
}

export function taskReassigned(params: {
  recipientName: string;
  taskTitle: string;
  taskNumber: string;
  taskId: string;
  reassignedBy: string;
  dueDate: Date | null;
}) {
  const due = params.dueDate
    ? params.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'No due date';
  return {
    subject: `Task reassigned to you: ${params.taskTitle} (${params.taskNumber})`,
    html: base(
      'Task Reassigned to You',
      `Hi ${params.recipientName},<br><br>
      The task <strong>${params.taskTitle} (${params.taskNumber})</strong> has been reassigned to you by <strong>${params.reassignedBy}</strong>.<br><br>
      <strong>Due:</strong> ${due}`,
      'View Task',
      `${APP_URL}/tasks/${params.taskId}`,
    ),
  };
}

export function taskOverdue(params: {
  recipientName: string;
  taskTitle: string;
  taskNumber: string;
  taskId: string;
  dueDate: Date;
  leadName?: string | null;
}) {
  const due = params.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return {
    subject: `Overdue task: ${params.taskTitle} (${params.taskNumber})`,
    html: base(
      'Task is Overdue',
      `Hi ${params.recipientName},<br><br>
      You have an overdue task that needs attention.<br><br>
      <strong>Task:</strong> ${params.taskTitle}<br>
      <strong>Task #:</strong> ${params.taskNumber}<br>
      <strong>Was due:</strong> ${due}
      ${params.leadName ? `<br><strong>Lead:</strong> ${params.leadName}` : ''}`,
      'View Task',
      `${APP_URL}/tasks/${params.taskId}`,
    ),
  };
}

// ── Follow-ups ────────────────────────────────────────────────────────────────

export function followUpScheduled(params: {
  recipientName: string;
  type: string;
  scheduledAt: Date;
  leadName: string;
  leadId: string;
  leadNumber: string;
  scheduledBy: string;
  notes?: string | null;
}) {
  const when = params.scheduledAt.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  });
  return {
    subject: `Follow-up scheduled: ${params.type} with ${params.leadName}`,
    html: base(
      'Follow-Up Scheduled',
      `Hi ${params.recipientName},<br><br>
      A <strong>${params.type}</strong> follow-up has been scheduled by <strong>${params.scheduledBy}</strong>.<br><br>
      <strong>Lead:</strong> ${params.leadName} (${params.leadNumber})<br>
      <strong>When:</strong> ${when}
      ${params.notes ? `<br><strong>Notes:</strong> ${params.notes}` : ''}`,
      'View Lead',
      `${APP_URL}/leads/${params.leadId}`,
    ),
  };
}

export function followUpDueToday(params: {
  recipientName: string;
  leadName: string;
  leadNumber: string;
  leadId: string;
  type?: string;
}) {
  return {
    subject: `Follow-up due today: ${params.leadName} (${params.leadNumber})`,
    html: base(
      'Follow-Up Due Today',
      `Hi ${params.recipientName},<br><br>
      You have a follow-up due today with <strong>${params.leadName} (${params.leadNumber})</strong>${params.type ? ` — ${params.type}` : ''}.`,
      'View Lead',
      `${APP_URL}/leads/${params.leadId}`,
    ),
  };
}

export function followUpOverdue(params: {
  recipientName: string;
  leadName: string;
  leadNumber: string;
  leadId: string;
}) {
  return {
    subject: `Overdue follow-up: ${params.leadName} (${params.leadNumber})`,
    html: base(
      'Follow-Up is Overdue',
      `Hi ${params.recipientName},<br><br>
      You have a missed follow-up with <strong>${params.leadName} (${params.leadNumber})</strong>. Please take action as soon as possible.`,
      'View Lead',
      `${APP_URL}/leads/${params.leadId}`,
    ),
  };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export function welcomeUser(params: {
  recipientName: string;
  setPasswordUrl: string;
}) {
  return {
    subject: "Welcome to Dealstack — set your password",
    html: base(
      `Welcome, ${params.recipientName}!`,
      `Your Dealstack account has been created. Click the button below to set your password and get started.<br><br>
      This link is valid for <strong>7 days</strong>. If you need a new link, use the "Forgot password?" option on the sign-in page.`,
      "Set Your Password",
      params.setPasswordUrl,
    ),
  };
}

export function passwordReset(params: {
  recipientName: string;
  resetUrl: string;
}) {
  return {
    subject: 'Reset your Dealstack password',
    html: base(
      'Reset Your Password',
      `Hi ${params.recipientName},<br><br>
      We received a request to reset your Dealstack password. Click the button below to choose a new password.<br><br>
      This link expires in <strong>1 hour</strong>. If you didn't request a reset, you can safely ignore this email.`,
      'Reset Password',
      params.resetUrl,
    ),
  };
}

export function hotLeadStale(params: {
  recipientName: string;
  leadName: string;
  leadNumber: string;
  leadId: string;
}) {
  return {
    subject: `Hot lead needs attention: ${params.leadName} (${params.leadNumber})`,
    html: base(
      'Hot Lead Needs Attention',
      `Hi ${params.recipientName},<br><br>
      Your hot lead <strong>${params.leadName} (${params.leadNumber})</strong> hasn't been contacted in the last 2 days. Reach out now before they go cold.`,
      'View Lead',
      `${APP_URL}/leads/${params.leadId}`,
    ),
  };
}
