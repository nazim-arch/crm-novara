import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { changeStageSchema } from "@/lib/validations/lead";
import { hasPermission } from "@/lib/rbac";
import { notifyLeadStageChanged, notifyLeadWon, notifyLeadLost } from "@/lib/email-notifications";

type Params = Promise<{ id: string }>;

export async function POST(request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(session.user.role, "lead:update")) {
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

    const lead = await prisma.lead.findUnique({
      where: { id, deleted_at: null },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Build lead update data
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
      activityMetadata.pipeline_from = lead.status;
      activityMetadata.pipeline_to = to_stage;
      activityMetadata.lost_reason = lost_reason || null;
      if (to_stage === "Won") {
        activityMetadata.settlement_value = settlement_value;
        activityMetadata.deal_commission_percent = deal_commission_percent;
      }
    }
    if (activity_stage) {
      activityMetadata.activity_from = lead.activity_stage;
      activityMetadata.activity_to = activity_stage;
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
    ]);

    // Recalculate closed_revenue when Won state changes
    if (to_stage === "Won" || lead.status === "Won") {
      const linkedOpps = await prisma.leadOpportunity.findMany({
        where: { lead_id: id },
        select: { opportunity_id: true },
      });

      for (const { opportunity_id } of linkedOpps) {
        const wonLeads = await prisma.leadOpportunity.findMany({
          where: { opportunity_id },
          include: {
            lead: {
              select: { status: true, settlement_value: true, deal_commission_percent: true, deleted_at: true },
            },
          },
        });

        const closedRevenue = wonLeads.reduce((sum, lo) => {
          if (
            lo.lead.deleted_at === null &&
            lo.lead.status === "Won" &&
            lo.lead.settlement_value !== null &&
            lo.lead.deal_commission_percent !== null
          ) {
            return sum + (Number(lo.lead.settlement_value) * Number(lo.lead.deal_commission_percent)) / 100;
          }
          return sum;
        }, 0);

        await prisma.opportunity.update({
          where: { id: opportunity_id },
          data: { closed_revenue: closedRevenue },
        });
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
