import { prisma } from "@/lib/prisma";
export type { CommissionStatus } from "./commission-utils";
export { calcAchievementPct, commissionStatus } from "./commission-utils";

// ─── IST month bounds ─────────────────────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function istMonthBounds(year: number, month: number): { start: Date; end: Date } {
  // First moment of month in IST = UTC midnight - 5:30
  const startIST = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - IST_OFFSET_MS);
  const endIST = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - IST_OFFSET_MS);
  return { start: startIST, end: endIST };
}

export function lastDayOfMonth(year: number, month: number): Date {
  // Last moment before next month in IST
  return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - IST_OFFSET_MS - 1);
}

// ─── Slab lookup ──────────────────────────────────────────────────────────────

export interface SlabRow {
  from_amount: { toString(): string };
  to_amount: { toString(): string } | null;
  commission_pct: { toString(): string };
  sort_order: number;
}

/**
 * Returns the active slab structure for a user as of the last day of the given
 * month. Finds the batch with the highest effective_from <= last_day_of_month.
 */
export async function getActiveSlabs(
  userId: string,
  year: number,
  month: number
): Promise<SlabRow[]> {
  const boundary = lastDayOfMonth(year, month);

  // Find the latest effective_from that is <= last day of month
  const latestBatch = await prisma.salesCommissionSlab.findFirst({
    where: {
      user_id: userId,
      effective_from: { lte: boundary },
    },
    orderBy: { effective_from: "desc" },
    select: { structure_id: true },
  });

  if (!latestBatch) return [];

  const slabs = await prisma.salesCommissionSlab.findMany({
    where: { structure_id: latestBatch.structure_id },
    orderBy: { sort_order: "asc" },
    select: { from_amount: true, to_amount: true, commission_pct: true, sort_order: true },
  });

  return slabs;
}

// ─── Revenue calculation ──────────────────────────────────────────────────────

export interface RevenueResult {
  closed_revenue: number;
  leads_won: number;
  leads_won_no_value: number;
}

/**
 * Sums closed revenue for Won leads assigned to a Sales user in the given month.
 * Uses LeadStageHistory.changed_at (IST bounds) to bucket the Win date.
 * Only counts leads that are currently Won (status = "Won").
 */
export async function calcMonthlyRevenue(
  userId: string,
  year: number,
  month: number
): Promise<RevenueResult> {
  const { start, end } = istMonthBounds(year, month);

  // Leads that moved to Won in this month window and are still Won
  const wonLeads = await prisma.lead.findMany({
    where: {
      assigned_to_id: userId,
      status: "Won",
      deleted_at: null,
      stage_history: {
        some: {
          to_stage: "Won",
          changed_at: { gte: start, lt: end },
        },
      },
    },
    select: {
      settlement_value: true,
      deal_commission_percent: true,
    },
  });

  let closed_revenue = 0;
  let leads_won = 0;
  let leads_won_no_value = 0;

  for (const lead of wonLeads) {
    leads_won++;
    if (lead.settlement_value != null && lead.deal_commission_percent != null) {
      const rev =
        Number(lead.settlement_value) * Number(lead.deal_commission_percent) / 100;
      closed_revenue += rev;
    } else {
      leads_won_no_value++;
    }
  }

  return { closed_revenue, leads_won, leads_won_no_value };
}

// ─── Commission calculation ───────────────────────────────────────────────────

export interface CommissionResult {
  commission_amount: number | null;
  slab_from: number | null;
  slab_to: number | null;
  slab_pct: number | null;
}

/**
 * Option A: find the slab bracket that contains closed_revenue, apply that
 * slab's percentage to the full closed_revenue amount.
 */
export function calcCommission(
  closedRevenue: number,
  slabs: SlabRow[]
): CommissionResult {
  if (slabs.length === 0 || closedRevenue <= 0) {
    return { commission_amount: null, slab_from: null, slab_to: null, slab_pct: null };
  }

  for (const slab of slabs) {
    const from = parseFloat(slab.from_amount.toString());
    const to = slab.to_amount != null ? parseFloat(slab.to_amount.toString()) : Infinity;
    if (closedRevenue >= from && closedRevenue < to) {
      const pct = parseFloat(slab.commission_pct.toString());
      return {
        commission_amount: closedRevenue * pct / 100,
        slab_from: from,
        slab_to: slab.to_amount != null ? parseFloat(slab.to_amount.toString()) : null,
        slab_pct: pct,
      };
    }
  }

  // Falls above all defined slabs — use the last (highest) slab
  const top = slabs[slabs.length - 1];
  const pct = parseFloat(top.commission_pct.toString());
  return {
    commission_amount: closedRevenue * pct / 100,
    slab_from: parseFloat(top.from_amount.toString()),
    slab_to: null,
    slab_pct: pct,
  };
}

