import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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
        ? { changed_at: { gte: new Date(from + "T00:00:00"), lte: new Date(to + "T23:59:59") } }
        : undefined;

    // Query Won links from LeadOpportunity (the authoritative source for per-deal revenue)
    const wonLinks = await prisma.leadOpportunity.findMany({
      where: {
        status: "Won",
        lead: {
          deleted_at: null,
          ...(userId ? { assigned_to_id: userId } : {}),
          ...(wonDateFilter
            ? { stage_history: { some: { to_stage: "Won", ...wonDateFilter } } }
            : {}),
        },
      },
      select: {
        id: true,
        settlement_value: true,
        deal_commission_percent: true,
        opportunity: { select: { id: true, name: true, opp_number: true } },
        lead: {
          select: {
            id: true,
            lead_number: true,
            full_name: true,
            assigned_to: { select: { id: true, name: true, short_name: true } },
            stage_history: {
              where: { to_stage: "Won" },
              orderBy: { changed_at: "desc" },
              take: 1,
              select: { changed_at: true },
            },
          },
        },
      },
      orderBy: { tagged_at: "desc" },
    });

    // Also include Won leads with no opportunity (unlinked — use Lead-level fields)
    const unlinkedWonLeads = await prisma.lead.findMany({
      where: {
        status: "Won",
        deleted_at: null,
        opportunities: { none: {} },
        ...(userId ? { assigned_to_id: userId } : {}),
        ...(wonDateFilter
          ? { stage_history: { some: { to_stage: "Won", ...wonDateFilter } } }
          : {}),
      },
      select: {
        id: true,
        lead_number: true,
        full_name: true,
        settlement_value: true,
        deal_commission_percent: true,
        assigned_to: { select: { id: true, name: true, short_name: true } },
        stage_history: {
          where: { to_stage: "Won" },
          orderBy: { changed_at: "desc" },
          take: 1,
          select: { changed_at: true },
        },
      },
    });

    const rows = [
      ...wonLinks.map((lo) => {
        const settlementValue = Number(lo.settlement_value ?? 0);
        const commissionPct = Number(lo.deal_commission_percent ?? 0);
        return {
          lead_number: lo.lead.lead_number,
          full_name: lo.lead.full_name,
          opp_names: lo.opportunity.name,
          opp_numbers: lo.opportunity.opp_number,
          won_date: lo.lead.stage_history[0]?.changed_at?.toISOString() ?? null,
          settlement_value: settlementValue,
          commission_pct: commissionPct,
          net_commission: (settlementValue * commissionPct) / 100,
          sales_person_id: lo.lead.assigned_to.id,
          sales_person_name: lo.lead.assigned_to.name,
        };
      }),
      ...unlinkedWonLeads.map((lead) => {
        const settlementValue = Number(lead.settlement_value ?? 0);
        const commissionPct = Number(lead.deal_commission_percent ?? 0);
        return {
          lead_number: lead.lead_number,
          full_name: lead.full_name,
          opp_names: "—",
          opp_numbers: "—",
          won_date: lead.stage_history[0]?.changed_at?.toISOString() ?? null,
          settlement_value: settlementValue,
          commission_pct: commissionPct,
          net_commission: (settlementValue * commissionPct) / 100,
          sales_person_id: lead.assigned_to.id,
          sales_person_name: lead.assigned_to.name,
        };
      }),
    ];

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("GET /api/reports/revenue:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
