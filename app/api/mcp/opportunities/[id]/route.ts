import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyMcpToken } from "@/lib/mcp-auth";

type Params = Promise<{ id: string }>;

export async function GET(request: Request, { params }: { params: Params }) {
  try {
    const auth = await verifyMcpToken(request);
    if (!(auth as { valid: true }).valid) return auth as NextResponse;

    const { id } = await params;

    const opportunity = await prisma.opportunity.findFirst({
      where: { deleted_at: null, OR: [{ id }, { opp_number: id }] },
      include: {
        created_by: { select: { id: true, name: true } },
        leads: {
          include: {
            lead: {
              select: {
                id: true, lead_number: true, full_name: true, phone: true,
                status: true, temperature: true, assigned_to: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { tagged_at: "desc" },
        },
        expenses: {
          orderBy: { expense_date: "desc" },
          select: {
            id: true, expense_date: true, category: true, description: true, amount: true,
            added_by: { select: { id: true, name: true } },
          },
        },
        configurations: true,
      },
    });

    if (!opportunity) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }

    const totalExpenses = opportunity.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const possibleRevenue = opportunity.total_sales_value && opportunity.commission_percent
      ? Number(opportunity.total_sales_value) * Number(opportunity.commission_percent) / 100
      : null;
    const netProfit = possibleRevenue !== null
      ? possibleRevenue - totalExpenses
      : null;

    return NextResponse.json({
      data: {
        ...opportunity,
        derived: {
          total_expenses: totalExpenses,
          possible_revenue: possibleRevenue,
          net_profit: netProfit,
          leads_count: opportunity.leads.length,
          won_count: opportunity.leads.filter((l) => l.status === "Won").length,
          lost_count: opportunity.leads.filter((l) => l.status === "Lost").length,
        },
      },
    });
  } catch (error) {
    console.error("GET /api/mcp/opportunities/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  try {
    const auth = await verifyMcpToken(request);
    if (!(auth as { valid: true }).valid) return auth as NextResponse;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const opp = await prisma.opportunity.findFirst({
      where: { deleted_at: null, OR: [{ id }, { opp_number: id }] },
      select: { id: true },
    });
    if (!opp) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }

    const allowedFields = ["name", "project", "developer", "property_type", "location", "commission_percent", "total_sales_value", "status"];
    const data: Record<string, unknown> = { updated_at: new Date() };
    for (const field of allowedFields) {
      if (field in body) data[field] = body[field];
    }

    if (Object.keys(data).length <= 1) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    const updated = await prisma.opportunity.update({ where: { id: opp.id }, data });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/mcp/opportunities/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
