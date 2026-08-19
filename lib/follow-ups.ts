import { prisma } from "@/lib/prisma";
import type {
  Prisma,
  FollowUp,
  FollowUpType,
  FollowUpPriority,
} from "@/lib/generated/prisma/client";

/**
 * Single Active Follow-up service (Fix #3).
 *
 * A lead has AT MOST ONE follow-up with `status = Active` at any time — enforced by the
 * partial unique index `follow_ups_one_active_per_lead`. `Lead.next_followup_date` /
 * `Lead.followup_type` are a denormalized mirror of that one active row and are written
 * ONLY through this module. Every follow-up create/complete/cancel path must funnel here;
 * no route may write `next_followup_date` or create a `FollowUp` directly.
 */

/** Lead statuses that must never have an active follow-up. */
export const NO_FOLLOWUP_STATUSES = [
  "Lost",
  "Won",
  "InvalidLead",
  "OnHold",
  "Recycle",
] as const;

export type NoFollowUpStatus = (typeof NO_FOLLOWUP_STATUSES)[number];

export function isNoFollowUpStatus(status: string | null | undefined): boolean {
  return !!status && (NO_FOLLOWUP_STATUSES as readonly string[]).includes(status);
}

/** Thrown when a follow-up is scheduled for a lead in a no-follow-up status. Routes map to 409. */
export class FollowUpForbiddenError extends Error {
  readonly code = "FOLLOWUP_FORBIDDEN";
  constructor(message: string) {
    super(message);
    this.name = "FollowUpForbiddenError";
  }
}

type TxClient = Prisma.TransactionClient;
type Reader = TxClient | typeof prisma;

/** Run `fn` inside the provided transaction, or open a new one when none is supplied. */
function inTransaction<T>(tx: TxClient | undefined, fn: (client: TxClient) => Promise<T>): Promise<T> {
  return tx ? fn(tx) : prisma.$transaction((client) => fn(client));
}

/** The single active follow-up for a lead, or null. */
export function getActiveFollowUp(lead_id: string, client: Reader = prisma) {
  return client.followUp.findFirst({ where: { lead_id, status: "Active" } });
}

export interface SetActiveFollowUpArgs {
  lead_id: string;
  scheduled_at: Date;
  type: FollowUpType;
  priority?: FollowUpPriority;
  assigned_to_id?: string | null;
  created_by_id: string;
  notes?: string | null;
  /** Human-readable reason recorded on the superseded row + activity, e.g. "Rescheduled by agent". */
  reason: string;
}

export interface SetActiveFollowUpResult {
  created: FollowUp;
  superseded: FollowUp | null;
}

/**
 * Make `scheduled_at`/`type` the lead's one active follow-up. Supersedes any existing active
 * row (newest scheduling action always wins, regardless of date), mirrors onto the lead, and
 * records a `followup_rescheduled` activity. Throws {@link FollowUpForbiddenError} when the lead
 * is in a no-follow-up status.
 */
export function setActiveFollowUp(
  args: SetActiveFollowUpArgs,
  tx?: TxClient
): Promise<SetActiveFollowUpResult> {
  return inTransaction(tx, async (client) => {
    const lead = await client.lead.findUnique({
      where: { id: args.lead_id },
      select: { id: true, status: true, next_followup_date: true },
    });
    if (!lead) throw new FollowUpForbiddenError(`Lead ${args.lead_id} not found`);
    if (isNoFollowUpStatus(lead.status)) {
      throw new FollowUpForbiddenError(
        `Cannot schedule a follow-up for a lead in status ${lead.status}`
      );
    }

    const existing = await getActiveFollowUp(args.lead_id, client);

    // Supersede first so the partial unique index never sees two Active rows for one lead.
    if (existing) {
      await client.followUp.update({
        where: { id: existing.id },
        data: {
          status: "Superseded",
          superseded_at: new Date(),
          closed_reason: args.reason,
        },
      });
    }

    const created = await client.followUp.create({
      data: {
        lead_id: args.lead_id,
        type: args.type,
        priority: args.priority ?? existing?.priority ?? "Medium",
        scheduled_at: args.scheduled_at,
        assigned_to_id: args.assigned_to_id ?? existing?.assigned_to_id ?? null,
        created_by_id: args.created_by_id,
        notes: args.notes ?? null,
        status: "Active",
      },
    });

    let superseded: FollowUp | null = null;
    if (existing) {
      superseded = await client.followUp.update({
        where: { id: existing.id },
        data: { superseded_by_id: created.id },
      });
    }

    await client.lead.update({
      where: { id: args.lead_id },
      data: { next_followup_date: args.scheduled_at, followup_type: args.type },
    });

    await client.activity.create({
      data: {
        entity_type: "Lead",
        entity_id: args.lead_id,
        action: "followup_rescheduled",
        actor_id: args.created_by_id,
        metadata: {
          old_date: existing?.scheduled_at.toISOString() ?? null,
          new_date: args.scheduled_at.toISOString(),
          reason: args.reason,
          follow_up_id: created.id,
          superseded_id: existing?.id ?? null,
        },
      },
    });

    return { created, superseded };
  });
}

export interface CompleteActiveFollowUpArgs {
  follow_up_id: string;
  outcome: string;
  notes?: string | null;
  actor_id: string;
  /** When present, atomically schedule the next active follow-up after completing this one. */
  next?: {
    scheduled_at: Date;
    type: FollowUpType;
    priority?: FollowUpPriority;
    assigned_to_id?: string | null;
    reason: string;
  };
}

export interface CompleteActiveFollowUpResult {
  completed: FollowUp;
  created: FollowUp | null;
}

/**
 * Mark a follow-up Completed. Nulls the lead mirror unless a `next` follow-up is created in the
 * same transaction (complete-and-reschedule for contacted / schedule_next / site_visit_done).
 */
export function completeActiveFollowUp(
  args: CompleteActiveFollowUpArgs,
  tx?: TxClient
): Promise<CompleteActiveFollowUpResult> {
  return inTransaction(tx, async (client) => {
    const now = new Date();
    const existing = await client.followUp.findUnique({ where: { id: args.follow_up_id } });
    if (!existing) throw new Error(`Follow-up ${args.follow_up_id} not found`);

    const completed = await client.followUp.update({
      where: { id: args.follow_up_id },
      data: {
        status: "Completed",
        completed_at: now,
        outcome: args.outcome,
        ...(args.notes !== undefined ? { notes: args.notes } : {}),
      },
    });

    const leadId = existing.lead_id;
    let created: FollowUp | null = null;

    if (leadId) {
      if (args.next) {
        const result = await setActiveFollowUp(
          {
            lead_id: leadId,
            scheduled_at: args.next.scheduled_at,
            type: args.next.type,
            priority: args.next.priority ?? existing.priority,
            assigned_to_id: args.next.assigned_to_id ?? existing.assigned_to_id,
            created_by_id: args.actor_id,
            reason: args.next.reason,
          },
          client
        );
        created = result.created;
      } else {
        await client.lead.update({
          where: { id: leadId },
          data: { next_followup_date: null, followup_type: null, last_contact_date: now },
        });
      }
    }

    return { completed, created };
  });
}

export interface ClearActiveFollowUpArgs {
  lead_id: string;
  reason: string;
  actor_id: string;
}

/**
 * Cancel the lead's active follow-up (if any) and null the lead mirror. Idempotent — safe to
 * call on every transition into a no-follow-up status. Records a `followup_cancelled` activity
 * when a row was actually cancelled.
 */
export function clearActiveFollowUp(
  args: ClearActiveFollowUpArgs,
  tx?: TxClient
): Promise<{ cleared: FollowUp | null }> {
  return inTransaction(tx, async (client) => {
    const existing = await getActiveFollowUp(args.lead_id, client);

    if (existing) {
      const cleared = await client.followUp.update({
        where: { id: existing.id },
        data: { status: "Cancelled", closed_reason: args.reason },
      });
      await client.activity.create({
        data: {
          entity_type: "Lead",
          entity_id: args.lead_id,
          action: "followup_cancelled",
          actor_id: args.actor_id,
          metadata: { reason: args.reason, follow_up_id: existing.id },
        },
      });
      await client.lead.update({
        where: { id: args.lead_id },
        data: { next_followup_date: null, followup_type: null },
      });
      return { cleared };
    }

    // No active row — ensure the mirror is null anyway (defensive; usually already null).
    await client.lead.update({
      where: { id: args.lead_id },
      data: { next_followup_date: null, followup_type: null },
    });
    return { cleared: null };
  });
}
