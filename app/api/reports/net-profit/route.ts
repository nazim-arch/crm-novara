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

    // Actual settlement value per opportunity — summed across its reconciled deal closures.
    // Powers the expected-vs-actual comparison (asking/anticipated vs settled/earned).
    const oppIds = opps.map((o) => o.id);
    const closures = oppIds.length
      ? await prisma.dealClosure.findMany({
          where: { status: "Reconciled", opportunity_id: { in: oppIds }, lead: { deleted_at: null } },
          select: { opportunity_id: true, actual_settlement_value: true },
        })
      : [];
    const settlementByOpp = new Map<string, number>();
    for (const c of closures) {
      if (!c.opportunity_id) continue;
      settlementByOpp.set(
        c.opportunity_id,
        (settlementByOpp.get(c.opportunity_id) ?? 0) + Number(c.actual_settlement_value ?? 0),
      );
    }

    const rows = opps.map((opp) => {
      const totalSalesValue = Number(opp.total_sales_value ?? 0);
      const possibleRevenue = Number(opp.possible_revenue ?? 0);
      const closedRevenue = Number(opp.closed_revenue ?? 0);
      const totalExpense = expenseMap.get(opp.id) ?? 0;
      const netProfit = closedRevenue - totalExpense;
      const achievement = possibleRevenue > 0 ? (closedRevenue / possibleRevenue) * 100 : null;

      // Expected vs actual comparison
      const actualSettlement = settlementByOpp.get(opp.id) ?? 0;
      const settlementVariance = actualSettlement - totalSalesValue;   // settled vs could-be-sold-at
      const commissionVariance = closedRevenue - possibleRevenue;      // earned vs anticipated

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
        // Expected-vs-actual
        actual_settlement: actualSettlement,
        settlement_variance: settlementVariance,
        anticipated_commission: possibleRevenue,
        actual_commission: closedRevenue,
        commission_variance: commissionVariance,
      };
    });

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("GET /api/reports/net-profit:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
