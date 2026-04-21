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
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const userId = searchParams.get("user_id");

    const wonDateFilter =
      from && to
        ? { changed_at: { gte: new Date(from + "T00:00:00"), lte: new Date(to + "T23:59:59") } }
        : undefined;

    const leads = await prisma.lead.findMany({
      where: {
        status: "Won",
        deleted_at: null,
        ...(userId ? { assigned_to_id: userId } : {}),
        ...(wonDateFilter
          ? {
              stage_history: {
                some: { to_stage: "Won", ...wonDateFilter },
              },
            }
          : {}),
      },
      select: {
        id: true,
        lead_number: true,
        full_name: true,
        settlement_value: true,
        deal_commission_percent: true,
        assigned_to: { select: { id: true, name: true, short_name: true } },
        opportunities: {
          include: { opportunity: { select: { id: true, name: true, opp_number: true } } },
        },
        stage_history: {
          where: { to_stage: "Won" },
          orderBy: { changed_at: "desc" },
          take: 1,
          select: { changed_at: true },
        },
      },
      orderBy: { updated_at: "desc" },
    });

    const rows = leads.map((lead) => {
      const settlementValue = Number(lead.settlement_value ?? 0);
      const commissionPct = Number(lead.deal_commission_percent ?? 0);
      const netCommission = (settlementValue * commissionPct) / 100;
      const wonDate = lead.stage_history[0]?.changed_at ?? null;
      const oppNames = lead.opportunities.map((lo) => lo.opportunity.name).join(", ") || "—";
      const oppNumbers = lead.opportunities.map((lo) => lo.opportunity.opp_number).join(", ") || "—";

      return {
        lead_number: lead.lead_number,
        full_name: lead.full_name,
        opp_names: oppNames,
        opp_numbers: oppNumbers,
        won_date: wonDate?.toISOString() ?? null,
        settlement_value: settlementValue,
        commission_pct: commissionPct,
        net_commission: netCommission,
        sales_person_id: lead.assigned_to.id,
        sales_person_name: lead.assigned_to.name,
      };
    });

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("GET /api/reports/revenue:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
