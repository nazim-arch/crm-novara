import { prisma } from "@/lib/prisma";

/**
 * Resolves which Lead+Opportunity combination a stage change applies to.
 * Status is owned per LeadOpportunity link, so every stage-write must target one link
 * (or the lead itself when it has no opportunities).
 *
 *  - explicit link/opportunity id in the request  -> that link
 *  - lead has exactly one link                     -> that link
 *  - lead has no links                             -> unlinked (write Lead.status directly)
 *  - lead has 2+ links and none specified          -> ambiguous (caller returns OPPORTUNITY_REQUIRED)
 */
export type StageTarget =
  | { kind: "link"; opportunity_link_id: string; opportunity_id: string }
  | { kind: "unlinked" }
  | { kind: "ambiguous"; opportunities: { link_id: string; opportunity_id: string; name: string }[] };

export async function resolveStageTarget(
  lead_id: string,
  opts: { opportunity_link_id?: string | null; opportunity_id?: string | null } = {},
): Promise<StageTarget> {
  const links = await prisma.leadOpportunity.findMany({
    where: { lead_id },
    select: { id: true, opportunity_id: true, opportunity: { select: { name: true } } },
    orderBy: { tagged_at: "asc" },
  });

  if (opts.opportunity_link_id) {
    const l = links.find((x) => x.id === opts.opportunity_link_id);
    if (l) return { kind: "link", opportunity_link_id: l.id, opportunity_id: l.opportunity_id };
  }
  if (opts.opportunity_id) {
    const l = links.find((x) => x.opportunity_id === opts.opportunity_id);
    if (l) return { kind: "link", opportunity_link_id: l.id, opportunity_id: l.opportunity_id };
  }
  if (links.length === 0) return { kind: "unlinked" };
  if (links.length === 1)
    return { kind: "link", opportunity_link_id: links[0].id, opportunity_id: links[0].opportunity_id };
  return {
    kind: "ambiguous",
    opportunities: links.map((l) => ({ link_id: l.id, opportunity_id: l.opportunity_id, name: l.opportunity.name })),
  };
}
