import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { updateOpportunitySchema } from "@/lib/validations/opportunity";
import { hasPermissionAsync } from "@/lib/rbac";
import { RETAINED_ON_CLOSE, leadAccessFilter, canViewHidden, isLeadVisibilityEnabled, visibleLinkWhere } from "@/lib/lead-visibility";
import { z } from "zod";
import { notifyLeadTaggedToOpportunity } from "@/lib/email-notifications";
import { revalidateTag } from "next/cache";

type Params = Promise<{ id: string }>;

export async function GET(_request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPermissionAsync(session.user.role, "opportunity:read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    // Access = ownership scope + visibility (flag-gated). Restricted callers only reach the
    // opportunity through a link they may see; the leads include is filtered to the same set.
    const access = await leadAccessFilter(session.user.role, session.user.id);
    const restrictLinks = (await isLeadVisibilityEnabled()) && !(await canViewHidden(session.user.role));
    const oppLinkWhere = restrictLinks ? visibleLinkWhere : { untagged_at: null };

    // Sales/TeamLead: verify they have a visible lead (or team lead's) linked to this opportunity
    if (session.user.role === "Sales" || session.user.role === "TeamLead") {
      const link = await prisma.leadOpportunity.findFirst({
        where: {
          opportunity_id: id,
          ...oppLinkWhere,
          lead: access ? { AND: [{ deleted_at: null }, access] } : { deleted_at: null },
        },
        select: { id: true },
      });
      if (!link) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const opp = await prisma.opportunity.findUnique({
      where: { id, deleted_at: null },
      include: {
        created_by: { select: { id: true, name: true } },
        configurations: { orderBy: { created_at: "asc" } },
        leads: {
          where: oppLinkWhere,
          include: {
            lead: {
              select: {
                id: true, lead_number: true, full_name: true, phone: true,
                status: true, temperature: true, settlement_value: true, deal_commission_percent: true,
              },
            },
          },
        },
        tasks: { where: { deleted_at: null }, include: { assigned_to: { select: { id: true, name: true } } }, orderBy: { due_date: "asc" } },
      },
    });

    if (!opp) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    return NextResponse.json({ data: opp });
  } catch (error) {
    console.error("GET /api/opportunities/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPermissionAsync(session.user.role, "opportunity:update"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const parsed = updateOpportunitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    const { configurations, notes, developer, opportunity_by, meta_form_ids, ...rest } = parsed.data;
    const isLand = rest.property_type === "Land";
    const activeConfigs = configurations.filter((c) => !c._delete);
    const configRows = activeConfigs.map((row) => {
      const rowTotal = isLand && row.land_area
        ? Number(row.land_area) * row.price_per_unit
        : row.number_of_units * row.price_per_unit;
      return { ...row, row_total: rowTotal };
    });
    const total_sales_value = configRows.reduce((sum, row) => sum + row.row_total, 0);
    const possible_revenue = (total_sales_value * rest.commission_percent) / 100;

    await prisma.opportunityConfiguration.deleteMany({ where: { opportunity_id: id } });

    const opp = await prisma.opportunity.update({
      where: { id, deleted_at: null },
      data: {
        ...rest, developer: developer || null, notes: notes || null,
        opportunity_by: opportunity_by ?? "Developer",
        meta_form_ids: meta_form_ids ?? [],
        total_sales_value, possible_revenue, updated_at: new Date(),
        configurations: {
          create: configRows.map((row) => ({
            label: row.label ?? "", number_of_units: row.number_of_units,
            price_per_unit: row.price_per_unit, row_total: row.row_total,
            land_area: row.land_area ?? null,
            area_unit: row.area_unit ?? null,
            sale_type: row.sale_type ?? null,
          })),
        },
      },
      include: { configurations: true },
    });

    revalidateTag("crm-dashboard", "max");
    return NextResponse.json({ data: opp });
  } catch (error) {
    console.error("PATCH /api/opportunities/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const tagSchema = z.object({ lead_id: z.string() });

export async function POST(request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Tagging changes a lead's pipeline — same gate as the lead-side tag route.
    if (!(await hasPermissionAsync(session.user.role, "lead:update"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = tagSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    const lead_id = parsed.data.lead_id;

    // Caller must be able to see the lead (ownership + visibility).
    const access = await leadAccessFilter(session.user.role, session.user.id);
    const lead = await prisma.lead.findFirst({
      where: { AND: [{ id: lead_id, deleted_at: null }, ...(access ? [access] : [])] },
      select: { id: true, status: true, activity_stage: true, potential_lead_value: true },
    });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const opp = await prisma.opportunity.findUnique({
      where: { id, deleted_at: null },
      select: { id: true, name: true, opp_number: true, status: true },
    });
    if (!opp) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

    // Restricted roles may only tag into a live (Active) opportunity.
    if (!(await canViewHidden(session.user.role)) && opp.status !== "Active") {
      return NextResponse.json(
        { error: "You can only tag a lead to an active project.", code: "TAG_INACTIVE_OPPORTUNITY_FORBIDDEN" },
        { status: 403 },
      );
    }

    // Reactivate-on-retag rather than recreate (respects the (lead_id, opportunity_id) unique).
    const existing = await prisma.leadOpportunity.findUnique({
      where: { lead_id_opportunity_id: { lead_id, opportunity_id: id } },
    });
    if (existing && existing.untagged_at === null) {
      return NextResponse.json({ error: "This opportunity is already linked to the lead" }, { status: 409 });
    }

    const tag = existing
      ? await prisma.leadOpportunity.update({
          where: { id: existing.id },
          data: { untagged_at: null, untagged_by_id: null, status: lead.status, activity_stage: lead.activity_stage },
        })
      : await prisma.leadOpportunity.create({
          data: {
            lead_id,
            opportunity_id: id,
            tagged_by_id: session.user.id,
            status: lead.status,
            activity_stage: lead.activity_stage,
            potential_lead_value: lead.potential_lead_value ?? null,
          },
        });

    await prisma.activity.create({
      data: {
        entity_type: "Lead", entity_id: lead_id, action: "opportunity_tagged",
        actor_id: session.user.id,
        metadata: { opportunity_id: id, opportunity_name: opp.name, opp_number: opp.opp_number, reactivated: !!existing },
      },
    });

    notifyLeadTaggedToOpportunity({
      leadId: lead_id,
      oppId: id,
      oppName: opp.name,
      oppNumber: opp.opp_number,
      taggedByName: session.user.name ?? session.user.email ?? "Someone",
    });

    revalidateTag("crm-dashboard", "max");
    return NextResponse.json({ data: tag }, { status: 201 });
  } catch (error) {
    console.error("POST /api/opportunities/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPermissionAsync(session.user.role, "opportunity:delete"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    // D5 (§5.2) — an opportunity holding any Booked/Won link cannot be deleted (soft or hard) by
    // anyone, incl. Admin. Those links anchor DealClosure/commission. Retire via Sold/Inactive.
    const earned = await prisma.leadOpportunity.findMany({
      where: { opportunity_id: id, untagged_at: null, status: { in: [...RETAINED_ON_CLOSE] } },
      select: { lead: { select: { lead_number: true } } },
    });
    if (earned.length > 0) {
      return NextResponse.json(
        {
          error: `This project has ${earned.length} booked or won deal(s) and cannot be deleted. Set it to Sold or Inactive instead.`,
          code: "OPPORTUNITY_HAS_EARNED_LINKS",
          count: earned.length,
          ...(session.user.role === "Admin" ? { leads: earned.map((e) => e.lead.lead_number) } : {}),
        },
        { status: 409 },
      );
    }

    if (session.user.role === "Admin") {
      // Hard delete: permanently remove opportunity and all related records
      await prisma.$transaction([
        prisma.task.deleteMany({ where: { opportunity_id: id } }),
        prisma.followUp.deleteMany({ where: { opportunity_id: id } }),
        prisma.opportunityExpense.deleteMany({ where: { opportunity_id: id } }),
        prisma.opportunityConfiguration.deleteMany({ where: { opportunity_id: id } }),
        prisma.leadOpportunity.deleteMany({ where: { opportunity_id: id } }),
        prisma.opportunity.delete({ where: { id } }),
      ]);
    } else {
      // Soft delete: mark opportunity and tasks as deleted, hard-delete FUs and expenses
      const now = new Date();
      await prisma.task.updateMany({
        where: { opportunity_id: id, deleted_at: null },
        data: { deleted_at: now },
      });
      await prisma.followUp.deleteMany({ where: { opportunity_id: id } });
      await prisma.opportunityExpense.deleteMany({ where: { opportunity_id: id } });
      await prisma.opportunity.update({
        where: { id, deleted_at: null },
        data: { deleted_at: now },
      });
    }

    revalidateTag("crm-dashboard", "max");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/opportunities/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
