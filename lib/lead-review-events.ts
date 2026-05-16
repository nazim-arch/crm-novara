import { prisma } from "@/lib/prisma";

type LeadReviewActionType =
  | "StageChange"
  | "FollowUpAdded"
  | "TemperatureChanged"
  | "AssigneeChanged"
  | "NoteAdded"
  | "FieldUpdated";

export function createLeadReviewEvent(params: {
  lead_id: string;
  opportunity_id?: string;
  triggered_by_id: string;
  trigger_type: LeadReviewActionType;
  trigger_context: Record<string, unknown>;
}) {
  // Fire-and-forget — never block the main request
  void prisma.leadReviewEvent
    .create({
      data: {
        lead_id: params.lead_id,
        opportunity_id: params.opportunity_id ?? null,
        triggered_by_id: params.triggered_by_id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        trigger_type: params.trigger_type as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        trigger_context: params.trigger_context as any,
        review_status: "Pending",
      },
    })
    .catch((err) => {
      console.error("[lead-review-events] Failed to create event:", err);
    });
}
