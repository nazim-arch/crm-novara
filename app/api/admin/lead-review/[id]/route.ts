import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { setActiveFollowUp, FollowUpForbiddenError } from "@/lib/follow-ups";

type Params = Promise<{ id: string }>;

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reviewed"),
    quality_score: z.enum(["Excellent", "Good", "Average", "Poor"]).optional(),
    review_notes: z.string().optional(),
  }),
  z.object({
    action: z.literal("park"),
    park_until: z.string().min(1),
    review_notes: z.string().optional(),
  }),
  z.object({
    action: z.literal("ask_agent"),
    review_notes: z.string().optional(),
  }),
  z.object({
    action: z.literal("client_followup"),
    followup_type: z.enum(["Call", "Email", "WhatsApp", "Visit", "Meeting", "Activity", "Internal"]),
    followup_scheduled_at: z.string().min(1),
    quality_score: z.enum(["Excellent", "Good", "Average", "Poor"]).optional(),
    review_notes: z.string().optional(),
  }),
  z.object({
    action: z.literal("escalate"),
    escalation_reason: z.string().min(1),
    review_notes: z.string().optional(),
  }),
]);

export async function PATCH(request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "Admin" && session.user.role !== "Manager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    const event = await prisma.leadReviewEvent.findUnique({
      where: { id },
      select: { id: true, lead_id: true, opportunity_id: true, review_status: true, triggered_by_id: true },
    });
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = parsed.data;
    const now = new Date();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {
      actioned_by_id: session.user.id,
      actioned_at: now,
    };

    if (data.action === "reviewed") {
      updateData.review_status = "Reviewed";
      if (data.quality_score) updateData.quality_score = data.quality_score;
      if (data.review_notes) updateData.review_notes = data.review_notes;
    } else if (data.action === "park") {
      updateData.review_status = "Parked";
      updateData.park_until = new Date(data.park_until);
      if (data.review_notes) updateData.review_notes = data.review_notes;
    } else if (data.action === "ask_agent") {
      updateData.review_status = "AskAgent";
      if (data.review_notes) updateData.review_notes = data.review_notes;

      // Notify the triggering agent
      await prisma.notification.create({
        data: {
          user_id: event.triggered_by_id,
          type: "NoteAdded",
          message: `Admin has a question about your lead activity. ${data.review_notes ? `Note: ${data.review_notes}` : ""}`,
          entity_type: "Lead",
          entity_id: event.lead_id,
        },
      });
    } else if (data.action === "client_followup") {
      updateData.review_status = "Reviewed";
      if (data.quality_score) updateData.quality_score = data.quality_score;
      if (data.review_notes) updateData.review_notes = data.review_notes;

      // Set the lead's single active follow-up (supersedes any existing one, syncs the mirror).
      try {
        await setActiveFollowUp({
          lead_id: event.lead_id,
          scheduled_at: new Date(data.followup_scheduled_at),
          type: data.followup_type,
          priority: "High",
          notes: data.review_notes ?? null,
          created_by_id: session.user.id,
          reason: "Scheduled from admin lead review",
        });
      } catch (err) {
        if (err instanceof FollowUpForbiddenError) {
          return NextResponse.json({ error: err.message }, { status: 409 });
        }
        throw err;
      }
    } else if (data.action === "escalate") {
      updateData.review_status = "Escalated";
      updateData.escalation_reason = data.escalation_reason;
      if (data.review_notes) updateData.review_notes = data.review_notes;
    }

    const updated = await prisma.leadReviewEvent.update({
      where: { id },
      data: updateData,
      select: { id: true, review_status: true, actioned_at: true },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/admin/lead-review/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
