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
 * Sums a user's closed revenue for the given month from RECONCILED deal closures —
 * Σ(actual_commission_amount + incentive_amount) across the agent's shares whose parent
 * closure is Reconciled and bucketed (won_year/won_month) to this month.
 *
 * This replaces the old `Lead.settlement_value × deal_commission_percent` derivation:
 * DealClosure is now the single source of truth. Slab/target/achievement math around this
 * (getActiveSlabs / calcCommission / calcAchievementPct) is unchanged.
 *
 * NOTE: kept self-contained (queries DealClosure directly rather than importing
 * getMonthlyCommissionTotals) to avoid an import cycle with lib/deal-closures.ts.
 */
export async function calcMonthlyRevenue(
  userId: string,
  year: number,
  month: number
): Promise<RevenueResult> {
  const shares = await prisma.dealClosureAgentShare.findMany({
    where: {
      agent_id: userId,
      deal_closure: {
        won_year: year,
        won_month: month,
        status: "Reconciled",
        lead: { deleted_at: null },
      },
    },
    select: {
      actual_commission_amount: true,
      incentive_amount: true,
      deal_closure_id: true,
    },
  });

  let closed_revenue = 0;
  let leads_won_no_value = 0;
  const closures = new Set<string>();

  for (const s of shares) {
    closures.add(s.deal_closure_id);
    if (s.actual_commission_amount == null) {
      leads_won_no_value++;
      continue;
    }
    closed_revenue += Number(s.actual_commission_amount) + Number(s.incentive_amount);
  }

  return { closed_revenue, leads_won: closures.size, leads_won_no_value };
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

