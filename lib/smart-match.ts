import { prisma } from "@/lib/prisma";
import type { Lead, Opportunity } from "@/lib/generated/prisma/client";

export interface MatchResult {
  opportunity: Opportunity;
  score: number;
  reasons: string[];
}

export async function findMatchingOpportunities(
  lead: Lead
): Promise<MatchResult[]> {
  const opportunities = await prisma.opportunity.findMany({
    where: { status: "Active", deleted_at: null },
  });

  const scored: MatchResult[] = opportunities.map((opp) => {
    let score = 0;
    const reasons: string[] = [];

    // Location match (40 pts)
    if (
      lead.location_preference &&
      opp.location.toLowerCase().includes(lead.location_preference.toLowerCase())
    ) {
      score += 40;
      reasons.push("Location matches preference");
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
    .sort((a, b) => b.score - a.score);
}
