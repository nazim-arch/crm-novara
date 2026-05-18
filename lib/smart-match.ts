import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { Lead, Opportunity } from "@/lib/generated/prisma/client";

export interface MatchResult {
  opportunity: Opportunity;
  score: number;
  reasons: string[];
}

export async function findMatchingOpportunities(
  lead: Lead,
  limit = 20
): Promise<MatchResult[]> {
  // ── 1. Push filtering to the database ────────────────────────────────
  const where: Prisma.OpportunityWhereInput = {
    status: "Active",
    deleted_at: null,
  };

  if (lead.property_type) {
    where.property_type = lead.property_type;
  }

  if (lead.budget_max) {
    const flexMin = Number(lead.budget_min ?? 0) * 0.8;
    const flexMax = Number(lead.budget_max) * 1.2;
    // Include NULL total_sales_value so we don't over-filter opps whose
    // price hasn't been entered yet — they can still score on location + type.
    where.OR = [
      { total_sales_value: null },
      { total_sales_value: { gte: flexMin, lte: flexMax } },
    ];
  }

  const opportunities = await prisma.opportunity.findMany({ where });

  if (opportunities.length === 0) return [];

  // ── 2. Location similarity via pg_trgm (only when preference is set) ─
  const locationSim = new Map<string, number>(); // opportunity id → similarity

  if (lead.location_preference) {
    const ids = opportunities.map((o) => o.id);
    const rows = await prisma.$queryRaw<Array<{ id: string; loc_sim: number }>>(
      Prisma.sql`
        SELECT id, similarity(location, ${lead.location_preference}) AS loc_sim
        FROM opportunities
        WHERE id IN (${Prisma.join(ids)})
      `
    );
    for (const row of rows) {
      locationSim.set(row.id, Number(row.loc_sim));
    }
  }

  // ── 3. Score (weights unchanged: location 40, property_type 30, budget 30) ─
  const scored: MatchResult[] = opportunities.map((opp) => {
    let score = 0;
    const reasons: string[] = [];

    // Location match (40 pts) — similarity threshold 0.2 allows partial matches
    if (lead.location_preference) {
      if ((locationSim.get(opp.id) ?? 0) >= 0.2) {
        score += 40;
        reasons.push("Location matches preference");
      }
    }

    // Property type match (30 pts)
    if (lead.property_type && opp.property_type === lead.property_type) {
      score += 30;
      reasons.push("Property type matches");
    }

    // Budget vs total sales value (30 pts)
    if (lead.budget_max && opp.total_sales_value) {
      const salesValue = Number(opp.total_sales_value);
      const budgetMax = Number(lead.budget_max);
      const budgetMin = Number(lead.budget_min ?? 0);
      if (salesValue >= budgetMin && salesValue <= budgetMax * 1.2) {
        score += 30;
        reasons.push("Budget aligns with opportunity value");
      }
    }

    return { opportunity: opp, score, reasons };
  });

  return scored
    .filter((s) => s.score >= 60)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
