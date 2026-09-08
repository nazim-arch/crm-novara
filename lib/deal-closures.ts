import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { getActiveSlabs, calcCommission } from "@/lib/sales-commission";
import { calcAchievementPct, CommissionRecordStatus } from "@/lib/commission-utils";

// ─── Helpers ────────────────────────────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Convert a UTC instant into the IST calendar year/month it falls in. */
export function istYearMonth(date: Date): { year: number; month: number } {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() + 1 };
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

type DbClient = Prisma.TransactionClient;

/** Typed error the API layer can map to HTTP status codes. */
export class DealClosureError extends Error {
  constructor(public code: DealClosureErrorCode, message: string) {
    super(message);
    this.name = "DealClosureError";
  }
}
export type DealClosureErrorCode =
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "MAKER_CHECKER"
  | "NOTES_REQUIRED"
  | "VALIDATION";

// ─── Monthly totals (single source for the commission engine + dashboards) ────

export interface MonthlyCommissionTotals {
  /** Σ(actual_commission + incentive) across this agent's Reconciled shares for the month. */
  closed_revenue: number;
  /** Same figure — commission is entered manually, so revenue == commission here. */
  commission_amount: number;
  leads_won: number;
  leads_won_no_value: number;
  /** Σ(planned_commission) across this agent's still-Pending shares for the month. */
  pending_estimate: number;
  pending_deals: number;
}

export async function getMonthlyCommissionTotals(
  userId: string,
  year: number,
  month: number,
  client: DbClient = prisma,
): Promise<MonthlyCommissionTotals> {
  const shares = await client.dealClosureAgentShare.findMany({
    where: {
      agent_id: userId,
      deal_closure: {
        won_year: year,
        won_month: month,
        status: { in: ["Reconciled", "Pending"] },
        lead: { deleted_at: null },
      },
    },
    select: {
      actual_commission_amount: true,
      incentive_amount: true,
      planned_commission_amount: true,
      deal_closure_id: true,
      deal_closure: { select: { status: true } },
    },
  });

  let closed_revenue = 0;
  let pending_estimate = 0;
  let leads_won_no_value = 0;
  const reconciledClosures = new Set<string>();
  const pendingClosures = new Set<string>();

  for (const s of shares) {
    if (s.deal_closure.status === "Reconciled") {
      reconciledClosures.add(s.deal_closure_id);
      if (s.actual_commission_amount == null) {
        leads_won_no_value++;
        continue;
      }
      closed_revenue += Number(s.actual_commission_amount) + Number(s.incentive_amount);
    } else {
      pendingClosures.add(s.deal_closure_id);
      if (s.planned_commission_amount != null) pending_estimate += Number(s.planned_commission_amount);
    }
  }

  return {
    closed_revenue: round2(closed_revenue),
    commission_amount: round2(closed_revenue),
    leads_won: reconciledClosures.size,
    leads_won_no_value,
    pending_estimate: round2(pending_estimate),
    pending_deals: pendingClosures.size,
  };
}

// ─── Opportunity revenue (net-profit report source) ──────────────────────────

/**
 * Recompute Opportunity.closed_revenue = the brokerage's REVENUE across that opportunity's
 * Reconciled closures: Σ(actual_settlement_value × commission %). This is our income on the deal —
 * NOT the agent payouts (those are a cost, subtracted to reach net profit in the Net Profit report).
 */
export async function recalculateOpportunityRevenue(
  opportunityId: string,
  client: DbClient = prisma,
): Promise<void> {
  const closures = await client.dealClosure.findMany({
    where: {
      opportunity_id: opportunityId,
      status: "Reconciled",
      lead: { deleted_at: null },
    },
    select: { actual_settlement_value: true, planned_commission_percent: true },
  });

  const revenue = closures.reduce(
    (sum, c) => sum + (Number(c.actual_settlement_value ?? 0) * Number(c.planned_commission_percent)) / 100,
    0,
  );

  await client.opportunity.update({
    where: { id: opportunityId },
    data: { closed_revenue: round2(revenue) },
  });
}

// ─── Commission record recompute (shared by calculate route + reconcile/cancel) ─

/**
 * Upsert a user's monthly SalesCommissionRecord from reconciled deal-closure data.
 * closed_revenue/commission_amount are the reconciled manual sum; slab_from/to/pct are
 * kept as an informational bracket only (commission is no longer slab-derived).
 * Does NOT gate on Finalized — per the founder decision, reconciliation corrections
 * always flow through (there is no finalize-lock on closures).
 */
export async function recomputeCommissionRecord(
  userId: string,
  year: number,
  month: number,
  client: DbClient = prisma,
) {
  const totals = await getMonthlyCommissionTotals(userId, year, month, client);
  const slabs = await getActiveSlabs(userId, year, month);
  const target = await client.salesMonthlyTarget.findUnique({
    where: { user_id_year_month: { user_id: userId, year, month } },
    select: { target_amount: true },
  });
  const target_amount = target ? Number(target.target_amount) : null;
  const achievement_pct = calcAchievementPct(totals.closed_revenue, target_amount);
  const slabInfo = calcCommission(totals.closed_revenue, slabs);

  const shared = {
    closed_revenue: totals.closed_revenue,
    leads_won: totals.leads_won,
    leads_won_no_value: totals.leads_won_no_value,
    target_amount,
    achievement_pct,
    slab_from: slabInfo.slab_from,
    slab_to: slabInfo.slab_to,
    slab_pct: slabInfo.slab_pct,
    commission_amount: totals.commission_amount,
  };

  return client.salesCommissionRecord.upsert({
    where: { user_id_year_month: { user_id: userId, year, month } },
    create: { user_id: userId, year, month, rec_status: CommissionRecordStatus.LIVE, ...shared },
    update: shared,
  });
}

// ─── Create (called from the Won stage-change branch) ─────────────────────────

export interface CreateDealClosureInput {
  lead_id: string;
  opportunity_id?: string | null;
  assigned_to_id: string;
  planned_settlement_value: number;
  planned_commission_percent: number;
  planned_by_id: string;
  won_at: Date;
}

export async function createDealClosure(input: CreateDealClosureInput) {
  // Idempotent: one active (non-Cancelled) closure per (lead, opportunity). The partial unique
  // indexes enforce this at the DB level; the guard avoids a needless insert/throw on the happy path.
  const opportunity_id = input.opportunity_id ?? null;
  const existing = await prisma.dealClosure.findFirst({
    where: { lead_id: input.lead_id, opportunity_id, status: { not: "Cancelled" } },
    include: { agent_shares: true },
  });
  if (existing) return existing;

  const planned_commission_amount = round2(
    (input.planned_settlement_value * input.planned_commission_percent) / 100,
  );
  const { year, month } = istYearMonth(input.won_at);

  try {
    return await prisma.dealClosure.create({
      data: {
        lead_id: input.lead_id,
        opportunity_id,
        planned_settlement_value: input.planned_settlement_value,
        planned_commission_percent: input.planned_commission_percent,
        planned_commission_amount,
        planned_by_id: input.planned_by_id,
        won_year: year,
        won_month: month,
        status: "Pending",
        agent_shares: {
          create: [
            {
              agent_id: input.assigned_to_id,
              role: "Primary",
              planned_commission_amount,
              actual_commission_amount: null,
              incentive_amount: 0,
            },
          ],
        },
      },
      include: { agent_shares: true },
    });
  } catch (err) {
    // Lost a race against the partial unique index — return the winner.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.dealClosure.findFirst({
        where: { lead_id: input.lead_id, opportunity_id, status: { not: "Cancelled" } },
        include: { agent_shares: true },
      });
      if (winner) return winner;
    }
    throw err;
  }
}

// ─── Reconcile (draft save or final) ──────────────────────────────────────────

export interface ReconcileShareInput {
  agent_id: string;
  role?: string | null;
  actual_commission_amount: number | null;
  incentive_amount: number;
}

export interface ReconcileDealClosureInput {
  deal_closure_id: string;
  actual_settlement_value: number | null;
  shares: ReconcileShareInput[];
  reconciled_by_id: string;
  notes?: string | null;
  /** true → transition to Reconciled (full validation); false → save draft (stays Pending). */
  markReconciled: boolean;
}

export async function reconcileDealClosure(input: ReconcileDealClosureInput) {
  const result = await prisma.$transaction(async (tx) => {
    const closure = await tx.dealClosure.findUnique({
      where: { id: input.deal_closure_id },
      include: { agent_shares: true },
    });
    if (!closure) throw new DealClosureError("NOT_FOUND", "Deal closure not found.");
    if (closure.status === "Cancelled")
      throw new DealClosureError("INVALID_STATE", "Cannot reconcile a cancelled closure.");

    // Maker-checker: modifying an already-reconciled closure requires a DIFFERENT admin + notes.
    const isEditingReconciled = closure.status === "Reconciled";
    if (isEditingReconciled) {
      if (closure.reconciled_by_id && closure.reconciled_by_id === input.reconciled_by_id) {
        throw new DealClosureError(
          "MAKER_CHECKER",
          "You reconciled this closure. A different admin must review and modify it.",
        );
      }
      if (!input.notes || !input.notes.trim()) {
        throw new DealClosureError(
          "NOTES_REQUIRED",
          "A note explaining the change is required when modifying a reconciled closure.",
        );
      }
    }

    if (input.markReconciled) {
      if (input.actual_settlement_value == null)
        throw new DealClosureError("VALIDATION", "Actual settlement value is required to reconcile.");
      if (input.shares.length === 0)
        throw new DealClosureError("VALIDATION", "At least one agent share is required.");
      for (const s of input.shares) {
        if (s.actual_commission_amount == null)
          throw new DealClosureError(
            "VALIDATION",
            "Every agent must have an actual commission amount before reconciling.",
          );
      }
    }

    // Settlement variance vs the frozen planned baseline.
    const plannedSettlement = Number(closure.planned_settlement_value);
    let settlement_variance: number | null = null;
    let settlement_variance_pct: number | null = null;
    if (input.actual_settlement_value != null) {
      settlement_variance = round2(input.actual_settlement_value - plannedSettlement);
      settlement_variance_pct =
        plannedSettlement !== 0 ? round4((settlement_variance / plannedSettlement) * 100) : null;
    }

    // Sync agent shares to the payload: delete removed, update existing, insert new co-agents.
    const existingByAgent = new Map(closure.agent_shares.map((s) => [s.agent_id, s]));
    const payloadAgentIds = new Set(input.shares.map((s) => s.agent_id));

    for (const s of closure.agent_shares) {
      if (!payloadAgentIds.has(s.agent_id)) {
        await tx.dealClosureAgentShare.delete({ where: { id: s.id } });
      }
    }

    for (const s of input.shares) {
      const existingShare = existingByAgent.get(s.agent_id);
      const plannedCommission = existingShare?.planned_commission_amount ?? null;
      const commission_variance =
        plannedCommission != null && s.actual_commission_amount != null
          ? round2(s.actual_commission_amount - Number(plannedCommission))
          : null;

      if (existingShare) {
        await tx.dealClosureAgentShare.update({
          where: { id: existingShare.id },
          data: {
            role: s.role ?? existingShare.role,
            actual_commission_amount: s.actual_commission_amount,
            incentive_amount: s.incentive_amount,
            commission_variance,
          },
        });
      } else {
        await tx.dealClosureAgentShare.create({
          data: {
            deal_closure_id: closure.id,
            agent_id: s.agent_id,
            role: s.role ?? "Co-agent",
            planned_commission_amount: null, // co-agents added at reconciliation have no prior plan
            actual_commission_amount: s.actual_commission_amount,
            incentive_amount: s.incentive_amount,
            commission_variance,
          },
        });
      }
    }

    const updated = await tx.dealClosure.update({
      where: { id: closure.id },
      data: {
        actual_settlement_value: input.actual_settlement_value,
        settlement_variance,
        settlement_variance_pct,
        notes: input.notes ?? closure.notes,
        status: input.markReconciled ? "Reconciled" : closure.status,
        ...(input.markReconciled
          ? { reconciled_by_id: input.reconciled_by_id, reconciled_at: new Date() }
          : {}),
      },
      include: { agent_shares: true },
    });

    await tx.activity.create({
      data: {
        entity_type: "DealClosure",
        entity_id: closure.id,
        action: isEditingReconciled
          ? "deal_closure.edited"
          : input.markReconciled
            ? "deal_closure.reconciled"
            : "deal_closure.draft_saved",
        actor_id: input.reconciled_by_id,
        metadata: {
          before: snapshotClosure(closure),
          after: snapshotClosure(updated),
          notes: input.notes ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    // Every agent touched (old ∪ new) so removed agents' records drop too.
    const affectedAgents = [
      ...new Set<string>([
        ...closure.agent_shares.map((s) => s.agent_id),
        ...input.shares.map((s) => s.agent_id),
      ]),
    ];
    return { updated, affectedAgents, opportunity_id: closure.opportunity_id, won_year: closure.won_year, won_month: closure.won_month };
  });

  // Recompute AFTER commit — avoids long interactive transactions and global-client reads inside a
  // tx (the Neon adapter errors on those). Reads the just-committed shares.
  for (const agentId of result.affectedAgents) {
    await recomputeCommissionRecord(agentId, result.won_year, result.won_month);
  }
  if (result.opportunity_id) await recalculateOpportunityRevenue(result.opportunity_id);

  return result.updated;
}

// ─── Cancel (called when a lead is reverted out of Won) ───────────────────────

export async function cancelDealClosure(input: {
  deal_closure_id: string;
  reason?: string | null;
  actor_id: string;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const closure = await tx.dealClosure.findUnique({
      where: { id: input.deal_closure_id },
      include: { agent_shares: true },
    });
    if (!closure) return null;
    if (closure.status === "Cancelled") return { updated: closure, agentIds: [] as string[], opportunity_id: null as string | null, won_year: 0, won_month: 0, skip: true };

    const updated = await tx.dealClosure.update({
      where: { id: closure.id },
      data: { status: "Cancelled", notes: input.reason ?? closure.notes },
    });

    await tx.activity.create({
      data: {
        entity_type: "DealClosure",
        entity_id: closure.id,
        action: "deal_closure.cancelled",
        actor_id: input.actor_id,
        metadata: { reason: input.reason ?? null } as Prisma.InputJsonValue,
      },
    });

    return {
      updated,
      agentIds: [...new Set(closure.agent_shares.map((s) => s.agent_id))],
      opportunity_id: closure.opportunity_id,
      won_year: closure.won_year,
      won_month: closure.won_month,
      skip: false,
    };
  });

  if (!result) return null;
  if (!result.skip) {
    for (const agentId of result.agentIds) {
      await recomputeCommissionRecord(agentId, result.won_year, result.won_month);
    }
    if (result.opportunity_id) await recalculateOpportunityRevenue(result.opportunity_id);
  }
  return result.updated;
}

/** Convenience for the stage-change revert path: cancel a lead's active closure, if any. */
/** Cancel the active closure for a specific (lead, opportunity) combination, if any. */
export async function cancelActiveDealClosureForLeadOpportunity(
  lead_id: string,
  opportunity_id: string | null,
  actor_id: string,
  reason?: string | null,
) {
  const closure = await prisma.dealClosure.findFirst({
    where: { lead_id, opportunity_id, status: { not: "Cancelled" } },
    select: { id: true },
  });
  if (!closure) return null;
  return cancelDealClosure({ deal_closure_id: closure.id, actor_id, reason });
}

/** Cancel ALL active closures for a lead (e.g. lead deletion / whole-lead revert). */
export async function cancelActiveDealClosuresForLead(
  lead_id: string,
  actor_id: string,
  reason?: string | null,
) {
  const closures = await prisma.dealClosure.findMany({
    where: { lead_id, status: { not: "Cancelled" } },
    select: { id: true },
  });
  for (const c of closures) {
    await cancelDealClosure({ deal_closure_id: c.id, actor_id, reason });
  }
  return closures.length;
}

// ─── Audit snapshot ───────────────────────────────────────────────────────────

type ClosureWithShares = Prisma.DealClosureGetPayload<{ include: { agent_shares: true } }>;

function snapshotClosure(c: ClosureWithShares) {
  return {
    status: c.status,
    actual_settlement_value: c.actual_settlement_value != null ? Number(c.actual_settlement_value) : null,
    settlement_variance: c.settlement_variance != null ? Number(c.settlement_variance) : null,
    shares: c.agent_shares.map((s) => ({
      agent_id: s.agent_id,
      role: s.role,
      actual_commission_amount:
        s.actual_commission_amount != null ? Number(s.actual_commission_amount) : null,
      incentive_amount: Number(s.incentive_amount),
    })),
  };
}
