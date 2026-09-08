import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Revenue report — one row per reconciled deal (DealClosure). Shows the company's revenue
// (settlement × commission %) and net profit (revenue − all agent commission + incentive), with the
// per-agent payout breakdown. Sourced entirely from reconciled closures so it agrees with the
// commission engine. Won-but-unreconciled deals are returned separately as `pending` estimates.
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "Admin")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const userId = searchParams.get("user_id");

    const wonDateFilter =
      from && to
        ? {
            stage_history: {
              some: {
                to_stage: "Won" as const,
                changed_at: { gte: new Date(from + "T00:00:00"), lte: new Date(to + "T23:59:59") },
              },
            },
          }
        : {};

    const leadFilter = { deleted_at: null, ...(userId ? { assigned_to_id: userId } : {}), ...wonDateFilter };

    const wonDateSelect = {
      stage_history: {
        where: { to_stage: "Won" as const },
        orderBy: { changed_at: "desc" as const },
        take: 1,
        select: { changed_at: true },
      },
    };

    const shareSelect = {
      select: {
        role: true,
        actual_commission_amount: true,
        incentive_amount: true,
        agent: { select: { name: true } },
      },
    };

    // Confirmed: one row per reconciled deal.
    const closures = await prisma.dealClosure.findMany({
      where: {
        status: "Reconciled",
        lead: leadFilter,
        ...(userId ? { agent_shares: { some: { agent_id: userId } } } : {}),
      },
      select: {
        id: true,
        actual_settlement_value: true,
        planned_settlement_value: true,
        planned_commission_percent: true,
        opportunity: { select: { name: true, opp_number: true } },
        lead: { select: { lead_number: true, full_name: true, ...wonDateSelect } },
        agent_shares: shareSelect,
      },
      orderBy: { won_year: "desc" },
    });

    const rows = closures.map((c) => {
      const settlement = Number(c.actual_settlement_value ?? c.planned_settlement_value ?? 0);
      const pct = Number(c.planned_commission_percent);
      const our_revenue = round2((settlement * pct) / 100);
      const agent_payout = round2(
        c.agent_shares.reduce((s, sh) => s + Number(sh.actual_commission_amount ?? 0) + Number(sh.incentive_amount ?? 0), 0),
      );
      return {
        id: c.id,
        lead_number: c.lead.lead_number,
        full_name: c.lead.full_name,
        opp_names: c.opportunity?.name ?? "—",
        won_date: c.lead.stage_history[0]?.changed_at?.toISOString() ?? null,
        settlement,
        commission_pct: pct,
        our_revenue,
        agent_payout,
        net_profit: round2(our_revenue - agent_payout),
        agents: c.agent_shares.map((sh) => ({
          name: sh.agent.name,
          role: sh.role ?? "—",
          amount: round2(Number(sh.actual_commission_amount ?? 0) + Number(sh.incentive_amount ?? 0)),
        })),
      };
    });

    // Pending (unreconciled) — estimates only.
    const pendingClosures = await prisma.dealClosure.findMany({
      where: {
        status: "Pending",
        lead: leadFilter,
        ...(userId ? { agent_shares: { some: { agent_id: userId } } } : {}),
      },
      select: {
        id: true,
        planned_settlement_value: true,
        planned_commission_amount: true,
        opportunity: { select: { name: true } },
        planned_by: { select: { name: true } },
        lead: { select: { lead_number: true, full_name: true, ...wonDateSelect } },
      },
      orderBy: [{ won_year: "desc" }, { won_month: "desc" }],
    });

    const pending = pendingClosures.map((c) => ({
      id: c.id,
      lead_number: c.lead.lead_number,
      full_name: c.lead.full_name,
      opp_names: c.opportunity?.name ?? "—",
      won_date: c.lead.stage_history[0]?.changed_at?.toISOString() ?? null,
      planned_settlement: Number(c.planned_settlement_value),
      planned_revenue: Number(c.planned_commission_amount), // settlement × % estimated at Won
      agent_name: c.planned_by?.name ?? "—",
    }));

    return NextResponse.json({ data: rows, pending });
  } catch (error) {
    console.error("GET /api/reports/revenue:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
