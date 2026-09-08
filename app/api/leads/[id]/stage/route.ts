import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { changeStageSchema } from "@/lib/validations/lead";
import { hasPermissionAsync } from "@/lib/rbac";
import { notifyLeadStageChanged, notifyLeadWon, notifyLeadLost } from "@/lib/email-notifications";
import { createLeadReviewEvent } from "@/lib/lead-review-events";
import { sendStageEvent } from "@/lib/meta-capi";
import { setActiveFollowUp, clearActiveFollowUp, isNoFollowUpStatus, FollowUpForbiddenError } from "@/lib/follow-ups";
import { createDealClosure, cancelActiveDealClosureForLeadOpportunity } from "@/lib/deal-closures";
import { resolveStageTarget } from "@/lib/lead-stage";

type Params = Promise<{ id: string }>;

export async function POST(request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await hasPermissionAsync(session.user.role, "lead:update"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // Auto-resolve pipeline stage for activity triggers
    if (body.activity_stage === "NotInterested" && !body.to_stage) {
      body.to_stage = "Lost";
    }
    if (body.activity_stage === "Junk" && !body.to_stage) {
      body.to_stage = "InvalidLead";
    }

    const parsed = changeStageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { to_stage, activity_stage, notes, lost_reason, lost_notes, settlement_value, deal_commission_percent, next_followup_date, next_followup_type } = parsed.data;
    // Optional: target a specific lead-opportunity link for per-opportunity stage tracking
    const opportunity_link_id: string | null = body.opportunity_link_id ?? null;

    const lead = await prisma.lead.findUnique({
      where: { id, deleted_at: null },
      include: { meta_leads: true },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Follow-up lifecycle intent for this stage change.
    const stageChanged = !!to_stage && to_stage !== lead.status;
    const enteringNoFollowup = !!to_stage && isNoFollowUpStatus(to_stage);
    const reactivating =
      stageChanged && (lead.status === "OnHold" || lead.status === "Recycle") && !enteringNoFollowup;

    // Reactivating a parked lead requires a fresh follow-up date (before any mutation).
    if (reactivating && !next_followup_date) {
      return NextResponse.json(
        { error: "A follow-up date is required to move this lead back into the pipeline.", code: "FOLLOWUP_DATE_REQUIRED" },
        { status: 422 }
      );
    }

    // Resolve which Lead+Opportunity combination this pipeline change applies to. Status is owned
    // per link; Lead.status is a rollup maintained by a DB trigger for linked leads.
    let targetLinkId: string | null = null;
    let targetOppId: string | null = null;
    let unlinked = false;
    if (to_stage) {
      const target = await resolveStageTarget(id, { opportunity_link_id });
      if (target.kind === "ambiguous") {
        return NextResponse.json(
          {
            error: "This lead has multiple opportunities — choose which one this applies to.",
            code: "OPPORTUNITY_REQUIRED",
            opportunities: target.opportunities,
          },
          { status: 422 },
        );
      }
      if (target.kind === "link") {
        targetLinkId = target.opportunity_link_id;
        targetOppId = target.opportunity_id;
      } else {
        unlinked = true;
      }
    } else if (opportunity_link_id) {
      const l = await prisma.leadOpportunity.findUnique({ where: { id: opportunity_link_id }, select: { id: true } });
      if (!l) return NextResponse.json({ error: "Opportunity link not found" }, { status: 404 });
      targetLinkId = opportunity_link_id;
    }

    // Prior status of the thing being changed (link for linked leads, lead for unlinked).
    let priorStatus = lead.status;
    if (to_stage && targetLinkId) {
      const cur = await prisma.leadOpportunity.findUnique({ where: { id: targetLinkId }, select: { status: true } });
      priorStatus = cur?.status ?? lead.status;
    }

    // Lead-level fields. For LINKED leads we do NOT write Lead.status (the rollup trigger derives it
    // from the target link we update below); for UNLINKED leads we set it directly.
    const leadUpdateData: Record<string, unknown> = { updated_at: new Date() };
    if (to_stage) {
      if (unlinked) {
        leadUpdateData.status = to_stage;
        if (lost_reason) leadUpdateData.lost_reason = lost_reason;
        if (lost_notes) leadUpdateData.lost_notes = lost_notes;
      }
      if (to_stage === "Won" && settlement_value !== undefined) leadUpdateData.settlement_value = settlement_value;
      if (to_stage === "Won" && deal_commission_percent !== undefined) leadUpdateData.deal_commission_percent = deal_commission_percent;
    }
    if (activity_stage) leadUpdateData.activity_stage = activity_stage;

    const activityMetadata: Record<string, unknown> = { notes: notes || null };
    if (to_stage) {
      activityMetadata.pipeline_from = priorStatus;
      activityMetadata.pipeline_to = to_stage;
      activityMetadata.lost_reason = lost_reason || null;
      activityMetadata.opportunity_link_id = targetLinkId;
      activityMetadata.opportunity_id = targetOppId;
      if (to_stage === "Won") {
        activityMetadata.settlement_value = settlement_value;
        activityMetadata.deal_commission_percent = deal_commission_percent;
      }
    }
    if (activity_stage) activityMetadata.activity_to = activity_stage;

    // Target link update (pipeline status for linked leads; activity_stage if a link is targeted).
    const linkUpdateData: Record<string, unknown> = {};
    if (targetLinkId) {
      if (to_stage) {
        linkUpdateData.status = to_stage;
        if (lost_reason) linkUpdateData.lost_reason = lost_reason;
        if (lost_notes) linkUpdateData.lost_notes = lost_notes;
      }
      if (activity_stage) linkUpdateData.activity_stage = activity_stage;
    }

    const [updatedLead] = await prisma.$transaction([
      prisma.lead.update({ where: { id }, data: leadUpdateData }),
      prisma.activity.create({
        data: {
          entity_type: "Lead",
          entity_id: id,
          action: to_stage ? "stage_changed" : "activity_stage_changed",
          actor_id: session.user.id,
          metadata: activityMetadata as Record<string, string | number | boolean | null>,
        },
      }),
      ...(to_stage
        ? [
            prisma.leadStageHistory.create({
              data: {
                lead_id: id,
                from_stage: priorStatus,
                to_stage,
                changed_by_id: session.user.id,
                notes: notes || null,
              },
            }),
          ]
        : []),
      ...(targetLinkId && Object.keys(linkUpdateData).length > 0
        ? [prisma.leadOpportunity.update({ where: { id: targetLinkId }, data: linkUpdateData })]
        : []),
    ]);

    // Apply the follow-up lifecycle for this stage change through the single-active service.
    try {
      if (enteringNoFollowup) {
        await clearActiveFollowUp({ lead_id: id, reason: `Lead moved to ${to_stage}`, actor_id: session.user.id });
      } else if (reactivating && next_followup_date) {
        await setActiveFollowUp({
          lead_id: id,
          scheduled_at: next_followup_date,
          type: next_followup_type ?? "Call",
          created_by_id: session.user.id,
          assigned_to_id: lead.assigned_to_id,
          reason: `Reactivated from ${lead.status}`,
        });
      } else if (next_followup_date) {
        await setActiveFollowUp({
          lead_id: id,
          scheduled_at: next_followup_date,
          type: next_followup_type ?? "Call",
          created_by_id: session.user.id,
          assigned_to_id: lead.assigned_to_id,
          reason: "Scheduled with stage change",
        });
      }
    } catch (err) {
      if (err instanceof FollowUpForbiddenError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }

    // Fire CAPI conversion events for Meta-sourced leads (fire-and-forget)
    if (to_stage && lead.meta_leads.length > 0) {
      for (const ml of lead.meta_leads) {
        const rawName = ml.full_name ?? lead.full_name;
        sendStageEvent({
          leadgenId:  ml.leadgen_id,
          stage:      to_stage,
          email:      ml.email ?? lead.email ?? undefined,
          phone:      ml.phone ?? undefined,
          firstName:  rawName ? rawName.split(" ")[0] : undefined,
          city:       ml.city  ?? lead.city  ?? undefined,
          crmLeadId:  lead.id,
          valueInr:   to_stage === "Won" ? Number(settlement_value ?? 0) : undefined,
        }).catch((err) => console.error("[CAPI stage event]", ml.leadgen_id, err));
      }
    }

    // Enqueue for Admin review
    createLeadReviewEvent({
      lead_id: id,
      triggered_by_id: session.user.id,
      trigger_type: "StageChange",
      trigger_context: {
        from_status: lead.status,
        to_stage: to_stage ?? null,
        activity_stage: activity_stage ?? null,
        notes: notes ?? null,
      },
    });

    // Won-state side effects. Opportunity.closed_revenue is derived from reconciled DealClosure data
    // (recalculateOpportunityRevenue in the reconcile/cancel service), not written here. A freshly-Won
    // deal is Pending and contributes nothing until an Admin closes it.
    if (to_stage === "Won" && settlement_value !== undefined && deal_commission_percent !== undefined) {
      const admins = await prisma.user.findMany({
        where: { role: "Admin", is_active: true },
        select: { id: true },
      });
      if (admins.length > 0) {
        await prisma.notification.createMany({
          data: admins.map((admin) => ({
            user_id: admin.id,
            type: "StageChanged" as const,
            message: `Deal Won: ${lead.full_name} (${lead.lead_number}) — Settlement ₹${Number(settlement_value).toLocaleString("en-IN")}`,
            entity_type: "Lead" as const,
            entity_id: id,
          })),
          skipDuplicates: true,
        });
      }
      notifyLeadWon({
        assignedToId: lead.assigned_to_id,
        leadId: id,
        leadName: lead.full_name,
        leadNumber: lead.lead_number,
        settlementValue: Number(settlement_value),
        commissionPercent: Number(deal_commission_percent),
        closedByName: session.user.name ?? session.user.email ?? "Someone",
      });

      // Drop the (lead, opportunity) deal into the Deal Closures queue as a Pending estimate.
      // Best-effort — a failure here must not roll back the committed stage change.
      try {
        await createDealClosure({
          lead_id: id,
          opportunity_id: targetOppId,
          assigned_to_id: lead.assigned_to_id,
          planned_settlement_value: Number(settlement_value),
          planned_commission_percent: Number(deal_commission_percent),
          planned_by_id: session.user.id,
          won_at: new Date(),
        });
      } catch (err) {
        console.error("[deal-closure create]", id, err);
      }
    }

    // Reverting THIS combination out of Won voids its deal closure (retained as Cancelled).
    if (to_stage && to_stage !== "Won" && priorStatus === "Won") {
      try {
        await cancelActiveDealClosureForLeadOpportunity(id, targetOppId, session.user.id, `Reverted from Won to ${to_stage}`);
      } catch (err) {
        console.error("[deal-closure cancel]", id, err);
      }
    }

    if (to_stage === "Lost") {
      const admins = await prisma.user.findMany({
        where: { role: "Admin", is_active: true },
        select: { id: true },
      });
      if (admins.length > 0) {
        await prisma.notification.createMany({
          data: admins.map((admin) => ({
            user_id: admin.id,
            type: "StageChanged" as const,
            message: `Lead Lost: ${lead.full_name} (${lead.lead_number})${lost_reason ? ` — Reason: ${lost_reason}` : ""}`,
            entity_type: "Lead" as const,
            entity_id: id,
          })),
          skipDuplicates: true,
        });
      }
      notifyLeadLost({
        assignedToId: lead.assigned_to_id,
        leadId: id,
        leadName: lead.full_name,
        leadNumber: lead.lead_number,
        lostReason: lost_reason,
        markedByName: session.user.name ?? session.user.email ?? "Someone",
      });
    }

    if (to_stage && to_stage !== "Won" && to_stage !== "Lost") {
      notifyLeadStageChanged({
        assignedToId: lead.assigned_to_id,
        leadId: id,
        leadName: lead.full_name,
        leadNumber: lead.lead_number,
        fromStage: lead.status,
        toStage: to_stage,
        changedByName: session.user.name ?? session.user.email ?? "Someone",
        notes,
      });
    }

    return NextResponse.json({ data: updatedLead });
  } catch (error) {
    console.error("POST /api/leads/[id]/stage:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
