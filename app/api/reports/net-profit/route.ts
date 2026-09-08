import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Net Profit report — per-opportunity P&L from reconciled deals:
//   Revenue      = Σ(actual settlement × commission %)   [our brokerage income]
//   Agent Payout = Σ(agent commission + incentive)       [what we paid agents]
//   Expenses     = Σ OpportunityExpense                  [marketing/other costs]
//   Net Profit   = Revenue − Agent Payout − Expenses
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
          _count: { select: { leads: { where: { lead: { deleted_at: null, status: "Won" } } } } },
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.opportunityExpense.groupBy({
        by: ["opportunity_id"],
        _sum: { amount: true },
        where: { opportunity: oppWhere },
      }),
    ]);

    const expenseMap = new Map(expenseSums.map((e) => [e.opportunity_id, Number(e._sum.amount ?? 0)]));

    // Revenue + agent payout per opportunity, from reconciled closures.
    const oppIds = opps.map((o) => o.id);
    const closures = oppIds.length
      ? await prisma.dealClosure.findMany({
          where: { status: "Reconciled", opportunity_id: { in: oppIds }, lead: { deleted_at: null } },
          select: {
            opportunity_id: true,
            actual_settlement_value: true,
            planned_commission_percent: true,
            agent_shares: { select: { actual_commission_amount: true, incentive_amount: true } },
          },
        })
      : [];

    const revenueByOpp = new Map<string, number>();
    const payoutByOpp = new Map<string, number>();
    const settlementByOpp = new Map<string, number>();
    const dealsByOpp = new Map<string, number>();
    for (const c of closures) {
      if (!c.opportunity_id) continue;
      const settlement = Number(c.actual_settlement_value ?? 0);
      const revenue = (settlement * Number(c.planned_commission_percent)) / 100;
      const payout = c.agent_shares.reduce(
        (s, sh) => s + Number(sh.actual_commission_amount ?? 0) + Number(sh.incentive_amount ?? 0),
        0,
      );
      revenueByOpp.set(c.opportunity_id, (revenueByOpp.get(c.opportunity_id) ?? 0) + revenue);
      payoutByOpp.set(c.opportunity_id, (payoutByOpp.get(c.opportunity_id) ?? 0) + payout);
      settlementByOpp.set(c.opportunity_id, (settlementByOpp.get(c.opportunity_id) ?? 0) + settlement);
      dealsByOpp.set(c.opportunity_id, (dealsByOpp.get(c.opportunity_id) ?? 0) + 1);
    }

    const rows = opps.map((opp) => {
      const settlement = round2(settlementByOpp.get(opp.id) ?? 0);
      const revenue = round2(revenueByOpp.get(opp.id) ?? 0);
      const agent_payout = round2(payoutByOpp.get(opp.id) ?? 0);
      const expenses = round2(expenseMap.get(opp.id) ?? 0);
      const net_profit = round2(revenue - agent_payout - expenses);
      return {
        opp_number: opp.opp_number,
        name: opp.name,
        property_type: opp.property_type,
        location: opp.location,
        status: opp.status,
        deals: dealsByOpp.get(opp.id) ?? 0,
        settlement,
        revenue,
        agent_payout,
        expenses,
        net_profit,
        won_leads_count: opp._count.leads,
      };
    });

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("GET /api/reports/net-profit:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
