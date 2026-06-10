import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyMcpToken } from "@/lib/mcp-auth";
import { sendStageEvent } from "@/lib/meta-capi";
import { createLeadReviewEvent } from "@/lib/lead-review-events";
import type { LeadStatus } from "@/lib/generated/prisma/client";

type Params = Promise<{ id: string }>;

export async function POST(request: Request, { params }: { params: Params }) {
  try {
    const auth = await verifyMcpToken(request);
    if (!(auth as { valid: true }).valid) return auth as NextResponse;
    const { userId } = auth as { valid: true; userId: string };

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { stage, notes, lost_reason, lost_notes, settlement_value, deal_commission_percent } =
      body as {
        stage?: string;
        notes?: string;
        lost_reason?: string;
        lost_notes?: string;
        settlement_value?: number;
        deal_commission_percent?: number;
      };

    if (!stage) {
      return NextResponse.json({ error: "stage is required" }, { status: 400 });
    }

    const validStages = ["New", "Contacted", "Prospect", "SiteVisitCompleted", "Negotiation", "Won", "Lost", "InvalidLead", "OnHold", "Recycle"];
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

    const updateData: Record<string, unknown> = {
      status: stage as LeadStatus,
      updated_at: new Date(),
    };
    if (lost_reason) updateData.lost_reason = lost_reason;
    if (lost_notes) updateData.lost_notes = lost_notes;
    if (stage === "Won" && settlement_value !== undefined) updateData.settlement_value = settlement_value;
    if (stage === "Won" && deal_commission_percent !== undefined) updateData.deal_commission_percent = deal_commission_percent;

    const [updatedLead] = await prisma.$transaction([
      prisma.lead.update({ where: { id: lead.id }, data: updateData }),
      prisma.activity.create({
        data: {
          entity_type: "Lead",
          entity_id: lead.id,
          action: "stage_changed",
          actor_id: userId,
          metadata: {
            pipeline_from: lead.status,
            pipeline_to: stage,
            lost_reason: lost_reason ?? null,
            notes: notes ?? null,
            source: "mcp",
          },
        },
      }),
      prisma.leadStageHistory.create({
        data: {
          lead_id: lead.id,
          from_stage: lead.status,
          to_stage: stage as LeadStatus,
          changed_by_id: userId,
          notes: notes ?? null,
        },
      }),
    ]);

    // Recalculate closed_revenue for all linked opportunities when Won
    if (stage === "Won" || lead.status === "Won") {
      const linkedOpps = await prisma.leadOpportunity.findMany({
        where: { lead_id: lead.id },
        select: { opportunity_id: true },
      });
      const oppIds = linkedOpps.map((lo) => lo.opportunity_id);
      if (oppIds.length > 0) {
        const wonLinks = await prisma.leadOpportunity.findMany({
          where: { opportunity_id: { in: oppIds }, status: "Won", lead: { deleted_at: null } },
          select: { opportunity_id: true, settlement_value: true, deal_commission_percent: true },
        });
        const revenueByOpp = new Map<string, number>(oppIds.map((oid) => [oid, 0]));
        for (const lo of wonLinks) {
          if (lo.settlement_value !== null && lo.deal_commission_percent !== null) {
            revenueByOpp.set(
              lo.opportunity_id,
              (revenueByOpp.get(lo.opportunity_id) ?? 0) +
                (Number(lo.settlement_value) * Number(lo.deal_commission_percent)) / 100
            );
          }
        }
        await Promise.all(
          Array.from(revenueByOpp.entries()).map(([oid, closedRevenue]) =>
            prisma.opportunity.update({ where: { id: oid }, data: { closed_revenue: closedRevenue } })
          )
        );
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
