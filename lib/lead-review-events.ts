import { prisma } from "@/lib/prisma";

type LeadReviewActionType =
  | "StageChange"
  | "FollowUpAdded"
  | "TemperatureChanged"
  | "AssigneeChanged"
  | "NoteAdded"
  | "FieldUpdated";

/**
 * Upserts a review event for a lead:
 * - Skips leads with status "New" (never actioned)
 * - If a Pending event already exists for the lead → updates it with the latest action
 * - If no Pending event exists → creates a new one
 * Fire-and-forget — never blocks the main request.
 */
export function createLeadReviewEvent(params: {
  lead_id: string;
  opportunity_id?: string;
  triggered_by_id: string;
  trigger_type: LeadReviewActionType;
  trigger_context: Record<string, unknown>;
}) {
  void (async () => {
    try {
      // Never queue leads that are still "New" — they haven't been actioned yet
      const lead = await prisma.lead.findUnique({
        where: { id: params.lead_id },
        select: { status: true },
      });
      if (!lead || lead.status === "New") return;

      // Check for an existing Pending event for this lead
      const existing = await prisma.leadReviewEvent.findFirst({
        where: { lead_id: params.lead_id, review_status: "Pending" },
        select: { id: true },
      });

      if (existing) {
        // Update in-place with the latest action so the card always reflects what just happened
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.leadReviewEvent.update as any)({
          where: { id: existing.id },
          data: {
            triggered_by_id: params.triggered_by_id,
            trigger_type: params.trigger_type,
            trigger_context: params.trigger_context,
            opportunity_id: params.opportunity_id ?? null,
            created_at: new Date(), // refresh timestamp to latest action
          },
        });
      } else {
        await prisma.leadReviewEvent.create({
          data: {
            lead_id: params.lead_id,
            opportunity_id: params.opportunity_id ?? null,
            triggered_by_id: params.triggered_by_id,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            trigger_type: params.trigger_type as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            trigger_context: params.trigger_context as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            review_status: "Pending" as any,
          },
        });
      }
    } catch (err) {
      console.error("[lead-review-events] Failed:", err);
    }
  })();
}
