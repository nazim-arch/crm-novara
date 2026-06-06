import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { changeStageSchema } from "@/lib/validations/lead";
import { hasPermissionAsync } from "@/lib/rbac";
import { notifyLeadStageChanged, notifyLeadWon, notifyLeadLost } from "@/lib/email-notifications";
import { createLeadReviewEvent } from "@/lib/lead-review-events";
import { sendStageEvent } from "@/lib/meta-capi";

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

    const { to_stage, activity_stage, notes, lost_reason, lost_notes, settlement_value, deal_commission_percent } = parsed.data;
    // Optional: target a specific lead-opportunity link for per-opportunity stage tracking
    const opportunity_link_id: string | null = body.opportunity_link_id ?? null;

    const lead = await prisma.lead.findUnique({
      where: { id, deleted_at: null },
      include: { meta_leads: true },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // If targeting a specific opportunity link, update it too
    let link = opportunity_link_id
      ? await prisma.leadOpportunity.findUnique({ where: { id: opportunity_link_id } })
      : null;

    if (opportunity_link_id && !link) {
      return NextResponse.json({ error: "Opportunity link not found" }, { status: 404 });
    }

    // Build lead update data — Lead.status always tracks the most recent change
    const leadUpdateData: Record<string, unknown> = { updated_at: new Date() };

    if (to_stage) {
      leadUpdateData.status = to_stage;
      if (lost_reason) leadUpdateData.lost_reason = lost_reason;
      if (lost_notes) leadUpdateData.lost_notes = lost_notes;
      if (to_stage === "Won" && settlement_value !== undefined) leadUpdateData.settlement_value = settlement_value;
      if (to_stage === "Won" && deal_commission_percent !== undefined) leadUpdateData.deal_commission_percent = deal_commission_percent;
    }

    if (activity_stage) {
      leadUpdateData.activity_stage = activity_stage;
    }

    const activityMetadata: Record<string, unknown> = { notes: notes || null };
    if (to_stage) {
      activityMetadata.pipeline_from = link ? link.status : lead.status;
      activityMetadata.pipeline_to = to_stage;
      activityMetadata.lost_reason = lost_reason || null;
      activityMetadata.opportunity_link_id = opportunity_link_id;
      if (to_stage === "Won") {
        activityMetadata.settlement_value = settlement_value;
        activityMetadata.deal_commission_percent = deal_commission_percent;
      }
    }
    if (activity_stage) {
      activityMetadata.activity_from = link ? link.activity_stage : lead.activity_stage;
      activityMetadata.activity_to = activity_stage;
    }

    // Build per-opportunity link update if a link is targeted
    const linkUpdateData: Record<string, unknown> = {};
    if (link) {
      if (to_stage) {
        linkUpdateData.status = to_stage;
        if (lost_reason) linkUpdateData.lost_reason = lost_reason;
        if (lost_notes) linkUpdateData.lost_notes = lost_notes;
        if (to_stage === "Won" && settlement_value !== undefined) linkUpdateData.settlement_value = settlement_value;
        if (to_stage === "Won" && deal_commission_percent !== undefined) linkUpdateData.deal_commission_percent = deal_commission_percent;
        if (to_stage !== "Won") {
          // Clear settlement on non-Won transition
          linkUpdateData.settlement_value = null;
          linkUpdateData.deal_commission_percent = null;
        }
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
                from_stage: lead.status,
                to_stage,
                changed_by_id: session.user.id,
                notes: notes || null,
              },
            }),
          ]
        : []),
      ...(link && Object.keys(linkUpdateData).length > 0
        ? [prisma.leadOpportunity.update({ where: { id: opportunity_link_id! }, data: linkUpdateData })]
        : []),
    ]);

    // Fire CAPI conversion events for Meta-sourced leads (fire-and-forget)
    if (to_stage && lead.meta_leads.length > 0) {
      for (const ml of lead.meta_leads) {
        sendStageEvent({
          leadgenId: ml.leadgen_id,
          stage:     to_stage,
          email:     ml.email    ?? undefined,
          phone:     ml.phone    ?? undefined,
          valueInr:  to_stage === "Won" ? Number(settlement_value ?? 0) : undefined,
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

    // Recalculate closed_revenue when Won state changes
    // Uses per-opportunity link fields (settlement_value, deal_commission_percent on LeadOpportunity)
    if (to_stage === "Won" || lead.status === "Won") {
      // Determine which opportunity IDs to recalculate
      const oppIdsToRecalc: string[] = [];
      if (link) {
        oppIdsToRecalc.push(link.opportunity_id);
      } else {
        const linkedOpps = await prisma.leadOpportunity.findMany({
          where: { lead_id: id },
          select: { opportunity_id: true },
        });
        oppIdsToRecalc.push(...linkedOpps.map((lo) => lo.opportunity_id));
      }

      if (oppIdsToRecalc.length > 0) {
        // For each opportunity, sum all Won links' settlement × commission from LeadOpportunity
        const wonLinks = await prisma.leadOpportunity.findMany({
          where: {
            opportunity_id: { in: oppIdsToRecalc },
            status: "Won",
            lead: { deleted_at: null },
          },
          select: {
            opportunity_id: true,
            settlement_value: true,
            deal_commission_percent: true,
          },
        });

        const revenueByOpp = new Map<string, number>(oppIdsToRecalc.map((oid) => [oid, 0]));
        for (const lo of wonLinks) {
          if (lo.settlement_value !== null && lo.deal_commission_percent !== null) {
            const prev = revenueByOpp.get(lo.opportunity_id) ?? 0;
            revenueByOpp.set(
              lo.opportunity_id,
              prev + Number(lo.settlement_value) * Number(lo.deal_commission_percent) / 100,
            );
          }
        }

        await Promise.all(
          Array.from(revenueByOpp.entries()).map(([oid, closedRevenue]) =>
            prisma.opportunity.update({ where: { id: oid }, data: { closed_revenue: closedRevenue } }),
          ),
        );
      }

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
