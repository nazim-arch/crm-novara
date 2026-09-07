/**
 * Fix #4 backfill: create a Reconciled DealClosure for every historical Won lead so that the
 * commission engine, revenue report, and net-profit report all read the same source.
 *
 * For each Won lead: one DealClosure with planned_* = actual_* (variance 0), status Reconciled,
 * reconciled_by_id = null (system backfill), won_year/won_month from the lead's Won transition
 * (IST), and one DealClosureAgentShare for the assigned agent.
 *
 * SAFETY: dry-run by default. It prints a before/after delta report per agent-month comparing the
 * EXISTING SalesCommissionRecord numbers against what the new model would produce, so you can
 * confirm no one's dashboard total changes before committing.
 *
 *   Dry run (no writes):  npx tsx scripts/backfill-deal-closures.ts
 *   Commit:               npx tsx scripts/backfill-deal-closures.ts --commit
 *
 * Commit mode requires the Fix #4 migrations (deal_closures tables) to be applied first.
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const COMMIT = process.argv.includes("--commit");

// ── Local replicas of lib helpers (scripts avoid the "@/..." path alias) ──────
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
function istYearMonth(date: Date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() + 1 };
}
function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - IST_OFFSET_MS - 1);
}
interface SlabRow { from_amount: number; to_amount: number | null; commission_pct: number }
function calcCommission(basis: number, slabs: SlabRow[]) {
  if (!slabs.length || basis <= 0) return { commission_amount: null, slab_from: null, slab_to: null, slab_pct: null };
  for (const s of slabs) {
    const to = s.to_amount ?? Infinity;
    if (basis >= s.from_amount && basis < to)
      return { commission_amount: (basis * s.commission_pct) / 100, slab_from: s.from_amount, slab_to: s.to_amount, slab_pct: s.commission_pct };
  }
  const top = slabs[slabs.length - 1];
  return { commission_amount: (basis * top.commission_pct) / 100, slab_from: top.from_amount, slab_to: null, slab_pct: top.commission_pct };
}
async function getActiveSlabs(userId: string, year: number, month: number): Promise<SlabRow[]> {
  const boundary = lastDayOfMonth(year, month);
  const latest = await prisma.salesCommissionSlab.findFirst({
    where: { user_id: userId, effective_from: { lte: boundary } },
    orderBy: { effective_from: "desc" },
    select: { structure_id: true },
  });
  if (!latest) return [];
  const slabs = await prisma.salesCommissionSlab.findMany({
    where: { structure_id: latest.structure_id },
    orderBy: { sort_order: "asc" },
    select: { from_amount: true, to_amount: true, commission_pct: true },
  });
  return slabs.map((s) => ({
    from_amount: Number(s.from_amount),
    to_amount: s.to_amount != null ? Number(s.to_amount) : null,
    commission_pct: Number(s.commission_pct),
  }));
}

interface AgentMonth { agentId: string; year: number; month: number; commission: number; leads: number }

async function main() {
  console.log(`\n=== Deal-closure backfill (${COMMIT ? "COMMIT" : "DRY RUN"}) ===\n`);

  const wonLeads = await prisma.lead.findMany({
    where: { status: "Won", deleted_at: null },
    select: {
      id: true,
      lead_number: true,
      assigned_to_id: true,
      settlement_value: true,
      deal_commission_percent: true,
      // Attribute the historical closure to a Won opportunity link (falls back to any link).
      // One closure per Won lead using the lead-level settlement — matches the pre-Fix#4 commission
      // total exactly (creating one per Won link would double-count the shared settlement).
      opportunities: {
        where: { status: "Won" },
        select: { opportunity_id: true },
        orderBy: { tagged_at: "asc" },
        take: 1,
      },
      stage_history: {
        where: { to_stage: "Won" },
        orderBy: { changed_at: "desc" },
        take: 1,
        select: { changed_at: true },
      },
    },
  });
  console.log(`Won leads found: ${wonLeads.length}`);

  // Skip leads that already have an active (non-Cancelled) closure.
  let existingLeadIds = new Set<string>();
  try {
    const existing = await prisma.dealClosure.findMany({
      where: { status: { not: "Cancelled" } },
      select: { lead_id: true },
    });
    existingLeadIds = new Set(existing.map((e) => e.lead_id));
    console.log(`Existing active closures (will skip): ${existingLeadIds.size}`);
  } catch {
    console.log("(deal_closures table not present yet — run migrations before --commit)");
  }

  const noValue: string[] = [];
  const noWonDate: string[] = [];
  const toCreate: {
    lead_id: string;
    opportunity_id: string | null;
    assigned_to_id: string;
    planned: number;
    settlement: number;
    pct: number;
    year: number;
    month: number;
  }[] = [];
  const byAgentMonth = new Map<string, AgentMonth>();

  for (const lead of wonLeads) {
    if (lead.settlement_value == null || lead.deal_commission_percent == null) {
      noValue.push(lead.lead_number);
      continue;
    }
    const wonAt = lead.stage_history[0]?.changed_at;
    if (!wonAt) {
      noWonDate.push(lead.lead_number);
      continue;
    }
    const settlement = Number(lead.settlement_value);
    const pct = Number(lead.deal_commission_percent);
    const planned = round2((settlement * pct) / 100);
    const { year, month } = istYearMonth(wonAt);

    if (!existingLeadIds.has(lead.id)) {
      toCreate.push({
        lead_id: lead.id,
        opportunity_id: lead.opportunities[0]?.opportunity_id ?? null,
        assigned_to_id: lead.assigned_to_id,
        planned,
        settlement,
        pct,
        year,
        month,
      });
    }

    const key = `${lead.assigned_to_id}:${year}:${month}`;
    const agg = byAgentMonth.get(key) ?? { agentId: lead.assigned_to_id, year, month, commission: 0, leads: 0 };
    agg.commission = round2(agg.commission + planned);
    agg.leads += 1;
    byAgentMonth.set(key, agg);
  }

  console.log(`Closures to create: ${toCreate.length}`);
  if (noValue.length) console.log(`⚠ Won leads missing settlement/commission (skipped): ${noValue.length} — ${noValue.join(", ")}`);
  if (noWonDate.length) console.log(`⚠ Won leads missing a Won stage-history date (skipped): ${noWonDate.length} — ${noWonDate.join(", ")}`);

  // ── Before/after report ─────────────────────────────────────────────────────
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const existingRecords = await prisma.salesCommissionRecord.findMany();
  const recByKey = new Map(existingRecords.map((r) => [`${r.user_id}:${r.year}:${r.month}`, r]));

  const keys = new Set<string>([...byAgentMonth.keys(), ...recByKey.keys()]);
  const deltas: string[] = [];
  for (const key of keys) {
    const am = byAgentMonth.get(key);
    const rec = recByKey.get(key);
    const newCommission = am?.commission ?? 0;
    const oldCommission = rec?.commission_amount != null ? Number(rec.commission_amount) : 0;
    const oldRevenue = rec ? Number(rec.closed_revenue) : 0;
    const deltaCommission = round2(newCommission - oldCommission);
    const deltaRevenue = round2(newCommission - oldRevenue);
    if (Math.abs(deltaCommission) > 0.01 || Math.abs(deltaRevenue) > 0.01) {
      const [agentId, y, m] = key.split(":");
      deltas.push(
        `  ${nameById.get(agentId) ?? agentId} ${y}-${m}: ` +
          `commission ${oldCommission} → ${newCommission} (Δ${deltaCommission}); ` +
          `closed_revenue ${oldRevenue} → ${newCommission} (Δ${deltaRevenue})`,
      );
    }
  }

  console.log(`\n── Before/after commission check (${keys.size} agent-months) ──`);
  if (deltas.length === 0) {
    console.log("✓ No existing agent-month commission or closed_revenue total changes.");
  } else {
    console.log(`⚠ ${deltas.length} agent-month(s) would change:`);
    console.log(deltas.join("\n"));
    console.log(
      "\nNOTE: the OLD model stored closed_revenue = Σ(settlement×pct) and commission = slab%(that).\n" +
        "The NEW model stores commission = closed_revenue = Σ(actual commission + incentive), which the\n" +
        "backfill seeds as Σ(settlement×pct). Any agent whose slab % ≠ 100% will therefore show a change.\n" +
        "Review with the founder before committing.",
    );
  }

  if (!COMMIT) {
    console.log("\nDry run complete — no data written. Re-run with --commit to apply.\n");
    return;
  }

  // ── Commit ────────────────────────────────────────────────────────────────
  console.log("\nCreating closures…");
  let created = 0;
  for (const c of toCreate) {
    await prisma.dealClosure.create({
      data: {
        lead_id: c.lead_id,
        opportunity_id: c.opportunity_id,
        planned_settlement_value: c.settlement,
        planned_commission_percent: c.pct,
        planned_commission_amount: c.planned,
        planned_by_id: c.assigned_to_id,
        won_year: c.year,
        won_month: c.month,
        actual_settlement_value: c.settlement,
        settlement_variance: 0,
        settlement_variance_pct: 0,
        status: "Reconciled",
        reconciled_by_id: null,
        notes: "system-backfill",
        agent_shares: {
          create: [{
            agent_id: c.assigned_to_id,
            role: "Primary",
            planned_commission_amount: c.planned,
            actual_commission_amount: c.planned,
            incentive_amount: 0,
            commission_variance: 0,
          }],
        },
      },
    });
    created++;
  }
  console.log(`Created ${created} closures.`);

  console.log("Recomputing SalesCommissionRecord for affected agent-months…");
  for (const am of byAgentMonth.values()) {
    const slabs = await getActiveSlabs(am.agentId, am.year, am.month);
    const target = await prisma.salesMonthlyTarget.findUnique({
      where: { user_id_year_month: { user_id: am.agentId, year: am.year, month: am.month } },
      select: { target_amount: true },
    });
    const targetAmount = target ? Number(target.target_amount) : null;
    const achievement = targetAmount && targetAmount !== 0 ? (am.commission / targetAmount) * 100 : null;
    const slabInfo = calcCommission(am.commission, slabs);
    const shared = {
      closed_revenue: am.commission,
      leads_won: am.leads,
      leads_won_no_value: 0,
      target_amount: targetAmount,
      achievement_pct: achievement,
      slab_from: slabInfo.slab_from,
      slab_to: slabInfo.slab_to,
      slab_pct: slabInfo.slab_pct,
      commission_amount: am.commission,
    };
    await prisma.salesCommissionRecord.upsert({
      where: { user_id_year_month: { user_id: am.agentId, year: am.year, month: am.month } },
      create: { user_id: am.agentId, year: am.year, month: am.month, rec_status: "Live", ...shared },
      update: shared,
    });
  }
  console.log("Done.\n");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
