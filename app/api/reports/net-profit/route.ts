import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermissionAsync } from "@/lib/rbac";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "Admin")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // Active | Inactive | Sold | all

    const oppWhere = {
      deleted_at: null,
      ...(status && status !== "all" ? { status: status as "Active" | "Inactive" | "Sold" } : {}),
    };

    const [opps, expenseSums] = await Promise.all([
      prisma.opportunity.findMany({
        where: oppWhere,
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
          _count: {
            select: {
              leads: { where: { lead: { deleted_at: null, status: "Won" } } },
            },
          },
          leads: {
            where: { lead: { deleted_at: null } },
            select: { lead_id: true },
          },
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.opportunityExpense.groupBy({
        by: ["opportunity_id"],
        _sum: { amount: true },
        where: { opportunity: oppWhere },
      }),
    ]);

    const expenseMap = new Map(
      expenseSums.map((e) => [e.opportunity_id, Number(e._sum.amount ?? 0)])
    );

    const rows = opps.map((opp) => {
      const totalSalesValue = Number(opp.total_sales_value ?? 0);
      const possibleRevenue = Number(opp.possible_revenue ?? 0);
      const closedRevenue = Number(opp.closed_revenue ?? 0);
      const totalExpense = expenseMap.get(opp.id) ?? 0;
      const netProfit = closedRevenue - totalExpense;
      const achievement = possibleRevenue > 0 ? (closedRevenue / possibleRevenue) * 100 : null;

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
        won_leads_count: opp._count.leads,
        total_leads_count: opp.leads.length,
      };
    });

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("GET /api/reports/net-profit:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
