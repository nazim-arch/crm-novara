import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/rbac";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "financial:view"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // Active | Inactive | Sold | all

    const opps = await prisma.opportunity.findMany({
      where: {
        deleted_at: null,
        ...(status && status !== "all" ? { status: status as "Active" | "Inactive" | "Sold" } : {}),
      },
      select: {
        id: true,
        opp_number: true,
        name: true,
        property_type: true,
        location: true,
        status: true,
        commission_percent: true,
        total_sales_value: true,
        possible_revenue: true,
        closed_revenue: true,
        expenses: { select: { amount: true } },
        leads: {
          include: {
            lead: {
              select: { status: true, deleted_at: true, settlement_value: true, deal_commission_percent: true },
            },
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    const rows = opps.map((opp) => {
      const totalSalesValue = Number(opp.total_sales_value ?? 0);
      const possibleRevenue = Number(opp.possible_revenue ?? 0);
      const closedRevenue = Number(opp.closed_revenue ?? 0);
      const totalExpense = opp.expenses.reduce((s, e) => s + Number(e.amount), 0);
      const netProfit = closedRevenue - totalExpense;
      const achievement = possibleRevenue > 0 ? (closedRevenue / possibleRevenue) * 100 : null;

      const wonLeads = opp.leads.filter(
        (lo) => lo.lead.deleted_at === null && lo.lead.status === "Won"
      );
      const wonLeadsCount = wonLeads.length;
      const totalLeadsCount = opp.leads.filter((lo) => lo.lead.deleted_at === null).length;

      return {
        opp_number: opp.opp_number,
        name: opp.name,
        property_type: opp.property_type,
        location: opp.location,
        status: opp.status,
        commission_percent: Number(opp.commission_percent),
        total_sales_value: totalSalesValue,
        possible_revenue: possibleRevenue,
        closed_revenue: closedRevenue,
        total_expense: totalExpense,
        net_profit: netProfit,
        achievement_pct: achievement,
        won_leads_count: wonLeadsCount,
        total_leads_count: totalLeadsCount,
      };
    });

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("GET /api/reports/net-profit:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
