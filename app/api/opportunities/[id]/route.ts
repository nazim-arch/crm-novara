import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { updateOpportunitySchema } from "@/lib/validations/opportunity";
import { hasPermission, leadScopeFilter } from "@/lib/rbac";
import { z } from "zod";
import { notifyLeadTaggedToOpportunity } from "@/lib/email-notifications";

type Params = Promise<{ id: string }>;

async function verifySalesOppAccess(oppId: string, userId: string): Promise<boolean> {
  const leadScope = leadScopeFilter("Sales", userId)!;
  const link = await prisma.leadOpportunity.findFirst({
    where: { opportunity_id: oppId, lead: { ...leadScope, deleted_at: null } },
    select: { id: true },
  });
  return !!link;
}

export async function GET(_request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "opportunity:read")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    // Sales: verify they have a lead linked to this opportunity
    if (session.user.role === "Sales") {
      if (!(await verifySalesOppAccess(id, session.user.id))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const opp = await prisma.opportunity.findUnique({
      where: { id, deleted_at: null },
      include: {
        created_by: { select: { id: true, name: true } },
        configurations: { orderBy: { created_at: "asc" } },
        leads: {
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
    if (!hasPermission(session.user.role, "opportunity:update")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const parsed = updateOpportunitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    const { configurations, notes, developer, ...rest } = parsed.data;
    const activeConfigs = configurations.filter((c) => !c._delete);
    const total_sales_value = activeConfigs.reduce((sum, row) => sum + row.number_of_units * row.price_per_unit, 0);
    const possible_revenue = (total_sales_value * rest.commission_percent) / 100;

    await prisma.opportunityConfiguration.deleteMany({ where: { opportunity_id: id } });

    const opp = await prisma.opportunity.update({
      where: { id, deleted_at: null },
      data: {
        ...rest, developer: developer || null, notes: notes || null,
        total_sales_value, possible_revenue, updated_at: new Date(),
        configurations: {
          create: activeConfigs.map((row) => ({
            label: row.label, number_of_units: row.number_of_units,
            price_per_unit: row.price_per_unit, row_total: row.number_of_units * row.price_per_unit,
          })),
        },
      },
      include: { configurations: true },
    });

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

    const { id } = await params;
    const body = await request.json();
    const parsed = tagSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

    const tag = await prisma.leadOpportunity.upsert({
      where: { lead_id_opportunity_id: { lead_id: parsed.data.lead_id, opportunity_id: id } },
      update: {},
      create: { lead_id: parsed.data.lead_id, opportunity_id: id, tagged_by_id: session.user.id },
    });

    await prisma.activity.create({
      data: {
        entity_type: "Lead", entity_id: parsed.data.lead_id, action: "opportunity_tagged",
        actor_id: session.user.id, metadata: { opportunity_id: id },
      },
    });

    const opp = await prisma.opportunity.findUnique({
      where: { id },
      select: { name: true, opp_number: true },
    });
    if (opp) {
      notifyLeadTaggedToOpportunity({
        leadId: parsed.data.lead_id,
        oppId: id,
        oppName: opp.name,
        oppNumber: opp.opp_number,
        taggedByName: session.user.name ?? session.user.email ?? "Someone",
      });
    }

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
    if (!hasPermission(session.user.role, "opportunity:delete")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const now = new Date();

    // Cascade: soft-delete linked tasks
    await prisma.task.updateMany({
      where: { opportunity_id: id, deleted_at: null },
      data: { deleted_at: now },
    });

    // Cascade: hard-delete linked follow-ups and expenses (no soft-delete on these)
    await prisma.followUp.deleteMany({ where: { opportunity_id: id } });
    await prisma.opportunityExpense.deleteMany({ where: { opportunity_id: id } });

    await prisma.opportunity.update({
      where: { id, deleted_at: null },
      data: { deleted_at: now },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/opportunities/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
