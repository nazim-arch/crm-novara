import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyMcpToken } from "@/lib/mcp-auth";
import { sendStageEvent } from "@/lib/meta-capi";
import { createLeadReviewEvent } from "@/lib/lead-review-events";
import { clearActiveFollowUp, isNoFollowUpStatus } from "@/lib/follow-ups";
import { createDealClosure, cancelActiveDealClosureForLeadOpportunity } from "@/lib/deal-closures";
import { resolveStageTarget } from "@/lib/lead-stage";
import type { LeadStatus } from "@/lib/generated/prisma/client";

type Params = Promise<{ id: string }>;

export async function POST(request: Request, { params }: { params: Params }) {
  try {
    const auth = await verifyMcpToken(request);
    if (!(auth as { valid: true }).valid) return auth as NextResponse;
    const { userId } = auth as { valid: true; userId: string };

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { stage, notes, lost_reason, lost_notes, settlement_value, deal_commission_percent, opportunity_id } =
      body as {
        stage?: string;
        notes?: string;
        lost_reason?: string;
        lost_notes?: string;
        settlement_value?: number;
        deal_commission_percent?: number;
        opportunity_id?: string;
      };

    if (!stage) {
      return NextResponse.json({ error: "stage is required" }, { status: 400 });
    }

    const validStages = ["New", "Contacted", "Prospect", "SiteVisitCompleted", "Negotiation", "Booked", "Won", "Lost", "InvalidLead", "OnHold", "Recycle"];
    if (!validStages.includes(stage)) {
      return NextResponse.json({ error: `Invalid stage. Must be one of: ${validStages.join(", ")}` }, { status: 400 });
    }

    const lead = await prisma.lead.findFirst({
      where: { deleted_at: null, OR: [{ id }, { lead_number: id }] },
      include: { meta_leads: true },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Resolve which Lead+Opportunity combination this applies to (status is per link).
    const target = await resolveStageTarget(lead.id, { opportunity_id });
    if (target.kind === "ambiguous") {
      return NextResponse.json(
        {
          error: "This lead has multiple opportunities — pass opportunity_id to choose one.",
          code: "OPPORTUNITY_REQUIRED",
          opportunities: target.opportunities,
        },
        { status: 422 },
      );
    }
    const targetOppId = target.kind === "link" ? target.opportunity_id : null;
    let priorStatus = lead.status;
    if (target.kind === "link") {
      const cur = await prisma.leadOpportunity.findUnique({ where: { id: target.opportunity_link_id }, select: { status: true } });
      priorStatus = cur?.status ?? lead.status;
    }

    // Lead.status is set directly only for unlinked leads; for linked leads the rollup trigger
    // derives it from the target link we update below.
    const leadData: Record<string, unknown> = { updated_at: new Date() };
    if (target.kind === "unlinked") {
      leadData.status = stage as LeadStatus;
      if (lost_reason) leadData.lost_reason = lost_reason;
      if (lost_notes) leadData.lost_notes = lost_notes;
    }
    if (stage === "Won" && settlement_value !== undefined) leadData.settlement_value = settlement_value;
    if (stage === "Won" && deal_commission_percent !== undefined) leadData.deal_commission_percent = deal_commission_percent;

    const [updatedLead] = await prisma.$transaction([
      prisma.lead.update({ where: { id: lead.id }, data: leadData }),
      prisma.activity.create({
        data: {
          entity_type: "Lead",
          entity_id: lead.id,
          action: "stage_changed",
          actor_id: userId,
          metadata: {
            pipeline_from: priorStatus,
            pipeline_to: stage,
            opportunity_id: targetOppId,
            lost_reason: lost_reason ?? null,
            notes: notes ?? null,
            source: "mcp",
          },
        },
      }),
      prisma.leadStageHistory.create({
        data: {
          lead_id: lead.id,
          from_stage: priorStatus,
          to_stage: stage as LeadStatus,
          changed_by_id: userId,
          notes: notes ?? null,
        },
      }),
      ...(target.kind === "link"
        ? [
            prisma.leadOpportunity.update({
              where: { id: target.opportunity_link_id },
              data: { status: stage as LeadStatus, ...(lost_reason ? { lost_reason } : {}), ...(lost_notes ? { lost_notes } : {}) },
            }),
          ]
        : []),
    ]);

    // Entering a no-follow-up status cancels the active follow-up and nulls the lead mirror.
    if (isNoFollowUpStatus(stage)) {
      await clearActiveFollowUp({ lead_id: lead.id, reason: `Lead moved to ${stage} (MCP)`, actor_id: userId });
    }

    // Deal-closure lifecycle for the resolved combination (additive, best-effort).
    if (stage === "Won" && settlement_value !== undefined && deal_commission_percent !== undefined) {
      try {
        await createDealClosure({
          lead_id: lead.id,
          opportunity_id: targetOppId,
          assigned_to_id: lead.assigned_to_id,
          planned_settlement_value: Number(settlement_value),
          planned_commission_percent: Number(deal_commission_percent),
          planned_by_id: userId,
          won_at: new Date(),
        });
      } catch (err) {
        console.error("[mcp deal-closure create]", lead.id, err);
      }
    }
    if (stage !== "Won" && priorStatus === "Won") {
      try {
        await cancelActiveDealClosureForLeadOpportunity(lead.id, targetOppId, userId, `Reverted from Won to ${stage} (MCP)`);
      } catch (err) {
        console.error("[mcp deal-closure cancel]", lead.id, err);
      }
    }

    // Fire CAPI events for Meta-sourced leads (fire-and-forget)
    if (lead.meta_leads.length > 0) {
      for (const ml of lead.meta_leads) {
        sendStageEvent({
          leadgenId: ml.leadgen_id,
          stage,
          email: ml.email ?? undefined,
          phone: ml.phone ?? undefined,
          valueInr: stage === "Won" ? Number(settlement_value ?? 0) : undefined,
        }).catch((err) => console.error("[MCP CAPI stage event]", ml.leadgen_id, err));
      }
    }

    createLeadReviewEvent({
      lead_id: lead.id,
      triggered_by_id: userId,
      trigger_type: "StageChange",
      trigger_context: { from_status: lead.status, to_stage: stage, notes: notes ?? null, source: "mcp" },
    });

    return NextResponse.json({ data: updatedLead });
  } catch (error) {
    console.error("POST /api/mcp/leads/[id]/stage:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
