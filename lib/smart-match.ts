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

    // Budget overlap (30 pts)
    if (
      lead.budget_min &&
      lead.budget_max &&
      opp.price_min &&
      opp.price_max
    ) {
      const overlap =
        Math.min(Number(lead.budget_max), Number(opp.price_max)) -
        Math.max(Number(lead.budget_min), Number(opp.price_min));
      if (overlap > 0) {
        score += 30;
        reasons.push("Budget overlaps with price range");
      }
    }

    return { opportunity: opp, score, reasons };
  });

  return scored
    .filter((s) => s.score >= 60)
    .sort((a, b) => b.score - a.score);
}
