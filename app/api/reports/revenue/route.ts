import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Revenue report — sourced entirely from reconciled DealClosure data (the single source of truth),
// so it agrees with the commission dashboard and net-profit report by construction. Each row is one
// AGENT'S share of a reconciled deal (a 3-agent deal produces 3 rows). Won-but-unreconciled deals
// are returned separately as `pending` (estimates), never blended into the confirmed totals.
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

    // Filter by the lead's Won transition date, matching the report's "Won Date" semantics.
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

    const leadFilter = {
      deleted_at: null,
      ...(userId ? { assigned_to_id: userId } : {}),
      ...wonDateFilter,
    };

    const wonDateSelect = {
      stage_history: {
        where: { to_stage: "Won" as const },
        orderBy: { changed_at: "desc" as const },
        take: 1,
        select: { changed_at: true },
      },
    };

    // Confirmed: one row per agent share on a Reconciled closure.
    const shares = await prisma.dealClosureAgentShare.findMany({
      where: {
        ...(userId ? { agent_id: userId } : {}),
        deal_closure: { status: "Reconciled", lead: leadFilter },
      },
      select: {
        id: true,
        role: true,
        actual_commission_amount: true,
        incentive_amount: true,
        agent: { select: { id: true, name: true } },
        deal_closure: {
          select: {
            actual_settlement_value: true,
            planned_settlement_value: true,
            opportunity: { select: { name: true, opp_number: true } },
            lead: { select: { lead_number: true, full_name: true, ...wonDateSelect } },
          },
        },
      },
    });

    const rows = shares.map((s) => {
      const commission = Number(s.actual_commission_amount ?? 0);
      const incentive = Number(s.incentive_amount ?? 0);
      const c = s.deal_closure;
      return {
        id: s.id,
        lead_number: c.lead.lead_number,
        full_name: c.lead.full_name,
        opp_names: c.opportunity?.name ?? "—",
        opp_numbers: c.opportunity?.opp_number ?? "—",
        won_date: c.lead.stage_history[0]?.changed_at?.toISOString() ?? null,
        settlement_value: Number(c.actual_settlement_value ?? c.planned_settlement_value ?? 0),
        agent_id: s.agent.id,
        agent_name: s.agent.name,
        role: s.role ?? "—",
        commission_amount: commission,
        incentive_amount: incentive,
        net_commission: commission + incentive,
      };
    });

    // Pending (unreconciled) — estimates only, surfaced separately.
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
        opportunity: { select: { name: true, opp_number: true } },
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
      planned_commission: Number(c.planned_commission_amount),
      agent_name: c.planned_by?.name ?? "—",
    }));

    return NextResponse.json({ data: rows, pending });
  } catch (error) {
    console.error("GET /api/reports/revenue:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
