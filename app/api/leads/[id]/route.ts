import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { updateLeadSchema } from "@/lib/validations/lead";
import { hasPermissionAsync, leadScopeFilter } from "@/lib/rbac";
import { CommissionRecordStatus } from "@/lib/commission-utils";
import { notifyLeadReassigned } from "@/lib/email-notifications";

type Params = Promise<{ id: string }>;

async function verifyLeadAccess(leadId: string, role: string, userId: string) {
  const scope = leadScopeFilter(role, userId);
  if (!scope) return true; // Admin/Manager — no restriction
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, deleted_at: null, ...scope },
    select: { id: true },
  });
  return !!lead;
}

export async function GET(_request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPermissionAsync(session.user.role, "lead:read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    if (!(await verifyLeadAccess(id, session.user.role, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const lead = await prisma.lead.findUnique({
      where: { id, deleted_at: null },
      include: {
        assigned_to: { select: { id: true, name: true, email: true, avatar_url: true } },
        lead_owner: { select: { id: true, name: true, email: true } },
        created_by: { select: { id: true, name: true } },
        opportunities: {
          include: {
            opportunity: {
              select: {
                id: true, opp_number: true, name: true, project: true,
                location: true, property_type: true, status: true,
                commission_percent: true, possible_revenue: true, closed_revenue: true,
                opportunity_by: true, deleted_at: true,
              },
            },
            tagged_by: { select: { id: true, name: true } },
          },
        },
        tasks: { where: { deleted_at: null }, include: { assigned_to: { select: { id: true, name: true } } }, orderBy: { due_date: "asc" } },
        stage_history: { include: { changed_by: { select: { id: true, name: true } } }, orderBy: { changed_at: "desc" } },
        followups: { orderBy: { scheduled_at: "desc" }, include: { created_by: { select: { id: true, name: true } } } },
      },
    });

    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return NextResponse.json({ data: lead });
  } catch (error) {
    console.error("GET /api/leads/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPermissionAsync(session.user.role, "lead:update"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    if (!(await verifyLeadAccess(id, session.user.role, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateLeadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    const { notes, financing_required, ...updateData } = parsed.data;
    const cleanData: Record<string, unknown> = Object.fromEntries(
      Object.entries(updateData).map(([k, v]) => [k, v === "" ? null : v])
    );
    if (notes !== undefined) cleanData.alternate_requirement = notes === "" ? null : notes;
    if (financing_required !== undefined) cleanData.financing_required = financing_required;

    // Detect reassignment before update
    const existingLead = await prisma.lead.findUnique({
      where: { id, deleted_at: null },
      select: { assigned_to_id: true, full_name: true, lead_number: true },
    });

    const lead = await prisma.lead.update({
      where: { id, deleted_at: null },
      data: { ...cleanData, updated_at: new Date() },
    });

    await prisma.activity.create({
      data: {
        entity_type: "Lead", entity_id: id, action: "lead_updated",
        actor_id: session.user.id, metadata: { fields: Object.keys(cleanData) },
      },
    });

    // Sync FollowUp record when next_followup_date is set on the lead
    if (lead.next_followup_date) {
      const existing = await prisma.followUp.findFirst({
        where: { lead_id: id, completed_at: null },
        orderBy: { scheduled_at: "asc" },
        select: { id: true },
      });
      if (existing) {
        await prisma.followUp.update({
          where: { id: existing.id },
          data: {
            scheduled_at: lead.next_followup_date,
            ...(lead.assigned_to_id && { assigned_to_id: lead.assigned_to_id }),
          },
        });
      } else {
        await prisma.followUp.create({
          data: {
            lead_id: id,
            assigned_to_id: lead.assigned_to_id,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            type: (lead.followup_type ?? "Call") as any,
            scheduled_at: lead.next_followup_date,
            created_by_id: session.user.id,
          },
        });
      }
    }

    // Email new assignee if reassigned
    const newAssigneeId = cleanData.assigned_to_id as string | undefined;
    if (newAssigneeId && existingLead && newAssigneeId !== existingLead.assigned_to_id && newAssigneeId !== session.user.id) {
      notifyLeadReassigned({
        newAssigneeId,
        leadId: id,
        leadName: existingLead.full_name,
        leadNumber: existingLead.lead_number,
        reassignedByName: session.user.name ?? session.user.email ?? "Someone",
      });
    }

    return NextResponse.json({ data: lead });
  } catch (error) {
    console.error("PATCH /api/leads/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPermissionAsync(session.user.role, "lead:delete"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    // Fetch lead before deletion (need status + assigned_to for commission recalc)
    const lead = await prisma.lead.findUnique({
      where: { id, deleted_at: null },
      select: { status: true, assigned_to_id: true },
    });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const linkedOpps = await prisma.leadOpportunity.findMany({
      where: { lead_id: id },
      select: { opportunity_id: true },
    });
    const oppIds = linkedOpps.map((lo) => lo.opportunity_id);

    const now = new Date();

    // Atomic cascade: soft-delete tasks + hard-delete follow-ups + soft-delete lead.
    // If any step fails the entire block rolls back — no partial-delete state.
    await prisma.$transaction([
      prisma.task.updateMany({
        where: { lead_id: id, deleted_at: null },
        data: { deleted_at: now },
      }),
      prisma.followUp.deleteMany({ where: { lead_id: id } }),
      prisma.lead.update({
        where: { id },
        data: { deleted_at: now, deleted_by: session.user.id },
      }),
    ]);

    // Recalculate closed_revenue for all affected opportunities in a single batch query
    // instead of N queries inside a loop.
    if (oppIds.length > 0) {
      const allLinkedLeads = await prisma.leadOpportunity.findMany({
        where: { opportunity_id: { in: oppIds } },
        select: {
          opportunity_id: true,
          lead: {
            select: {
              status: true,
              settlement_value: true,
              deal_commission_percent: true,
              deleted_at: true,
            },
          },
        },
      });

      // Aggregate revenue per opportunity in JS (one pass)
      const revenueByOpp = new Map<string, number>(oppIds.map((oid) => [oid, 0]));
      for (const lo of allLinkedLeads) {
        if (
          lo.lead.deleted_at === null &&
          lo.lead.status === "Won" &&
          lo.lead.settlement_value !== null &&
          lo.lead.deal_commission_percent !== null
        ) {
          const prev = revenueByOpp.get(lo.opportunity_id) ?? 0;
          revenueByOpp.set(
            lo.opportunity_id,
            prev + lo.lead.settlement_value.mul(lo.lead.deal_commission_percent).div(100).toNumber(),
          );
        }
      }

      // Fire all opportunity updates in parallel (not sequentially)
      await Promise.all(
        Array.from(revenueByOpp.entries()).map(([oid, closedRevenue]) =>
          prisma.opportunity.update({
            where: { id: oid },
            data: { closed_revenue: closedRevenue },
          }),
        ),
      );
    }

    // Recalculate commission record if this was a Won lead
    if (lead.status === "Won") {
      const wonHistory = await prisma.leadStageHistory.findFirst({
        where: { lead_id: id, to_stage: "Won" },
        orderBy: { changed_at: "desc" },
        select: { changed_at: true },
      });

      if (wonHistory) {
        const wonDate = wonHistory.changed_at;
        const year = wonDate.getFullYear();
        const month = wonDate.getMonth() + 1;

        const record = await prisma.salesCommissionRecord.findUnique({
          where: { user_id_year_month: { user_id: lead.assigned_to_id, year, month } },
          select: { rec_status: true },
        });

        // Only recalculate Live records; Finalized records are locked
        if (record && record.rec_status === CommissionRecordStatus.LIVE) {
          const { calcMonthlyRevenue, getActiveSlabs, calcCommission } = await import("@/lib/sales-commission");
          const { calcAchievementPct } = await import("@/lib/commission-utils");

          const [revenue, slabs, target] = await Promise.all([
            calcMonthlyRevenue(lead.assigned_to_id, year, month),
            getActiveSlabs(lead.assigned_to_id, year, month),
            prisma.salesMonthlyTarget.findUnique({
              where: { user_id_year_month: { user_id: lead.assigned_to_id, year, month } },
              select: { target_amount: true },
            }),
          ]);

          const commission = calcCommission(revenue.closed_revenue, slabs);
          const targetAmount = target ? Number(target.target_amount) : null;
          const achievementPct = calcAchievementPct(revenue.closed_revenue, targetAmount);

          await prisma.salesCommissionRecord.update({
            where: { user_id_year_month: { user_id: lead.assigned_to_id, year, month } },
            data: {
              closed_revenue: revenue.closed_revenue,
              leads_won: revenue.leads_won,
              leads_won_no_value: revenue.leads_won_no_value,
              target_amount: targetAmount,
              achievement_pct: achievementPct,
              slab_from: commission.slab_from,
              slab_to: commission.slab_to,
              slab_pct: commission.slab_pct,
              commission_amount: commission.commission_amount,
              updated_at: now,
            },
          });
        }
      }
    }

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("DELETE /api/leads/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
