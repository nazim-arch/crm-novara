import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyMcpToken } from "@/lib/mcp-auth";
import { startOfDay, endOfDay } from "date-fns";

export async function GET(request: Request) {
  try {
    const auth = await verifyMcpToken(request);
    if (!(auth as { valid: true }).valid) return auth as NextResponse;

    const { searchParams } = new URL(request.url);
    const metric = searchParams.get("metric");
    const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : null;
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : null;
    const assigned_to = searchParams.get("assigned_to") ?? undefined;

    const validMetrics = [
      "leads_summary", "leads_today", "lost_reasons", "pipeline_by_stage",
      "pipeline_by_temperature", "follow_ups_overdue", "revenue_summary",
      "agent_performance", "stage_changes", "recent_activity",
    ];

    if (!metric || !validMetrics.includes(metric)) {
      return NextResponse.json(
        { error: `metric required. Valid values: ${validMetrics.join(", ")}` },
        { status: 400 }
      );
    }

    const dateFilter = from || to
      ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }
      : null;

    let data: unknown;

    switch (metric) {
      case "leads_summary": {
        const [total, byStatus, byTemperature, bySource] = await Promise.all([
          prisma.lead.count({ where: { deleted_at: null, ...(assigned_to ? { assigned_to_id: assigned_to } : {}) } }),
          prisma.lead.groupBy({
            by: ["status"],
            where: { deleted_at: null, ...(assigned_to ? { assigned_to_id: assigned_to } : {}) },
            _count: { id: true },
          }),
          prisma.lead.groupBy({
            by: ["temperature"],
            where: { deleted_at: null, ...(assigned_to ? { assigned_to_id: assigned_to } : {}) },
            _count: { id: true },
          }),
          prisma.lead.groupBy({
            by: ["lead_source"],
            where: { deleted_at: null, ...(assigned_to ? { assigned_to_id: assigned_to } : {}) },
            _count: { id: true },
            orderBy: { _count: { id: "desc" } },
          }),
        ]);
        data = {
          total,
          by_status: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
          by_temperature: byTemperature.map((t) => ({ temperature: t.temperature, count: t._count.id })),
          by_source: bySource.map((s) => ({ source: s.lead_source, count: s._count.id })),
        };
        break;
      }

      case "leads_today": {
        const todayStart = startOfDay(new Date());
        const todayEnd = endOfDay(new Date());
        const [createdToday, stageChangesToday, followUpsCompletedToday, wonToday, lostToday] = await Promise.all([
          prisma.lead.findMany({
            where: { deleted_at: null, created_at: { gte: todayStart, lte: todayEnd } },
            select: { id: true, lead_number: true, full_name: true, phone: true, lead_source: true,
              temperature: true, assigned_to: { select: { id: true, name: true } } },
          }),
          prisma.leadStageHistory.findMany({
            where: { changed_at: { gte: todayStart, lte: todayEnd } },
            include: {
              lead: { select: { id: true, lead_number: true, full_name: true } },
              changed_by: { select: { id: true, name: true } },
            },
            orderBy: { changed_at: "desc" },
          }),
          prisma.followUp.count({
            where: { completed_at: { gte: todayStart, lte: todayEnd } },
          }),
          prisma.lead.findMany({
            where: { deleted_at: null, status: "Won", updated_at: { gte: todayStart, lte: todayEnd } },
            select: { id: true, lead_number: true, full_name: true, settlement_value: true, deal_commission_percent: true,
              assigned_to: { select: { id: true, name: true } } },
          }),
          prisma.lead.findMany({
            where: { deleted_at: null, status: "Lost", updated_at: { gte: todayStart, lte: todayEnd } },
            select: { id: true, lead_number: true, full_name: true, lost_reason: true,
              assigned_to: { select: { id: true, name: true } } },
          }),
        ]);
        data = {
          created: createdToday,
          stage_changes: stageChangesToday,
          follow_ups_completed: followUpsCompletedToday,
          won: wonToday,
          lost: lostToday,
          summary: {
            new_leads: createdToday.length,
            stage_moves: stageChangesToday.length,
            won_count: wonToday.length,
            lost_count: lostToday.length,
          },
        };
        break;
      }

      case "lost_reasons": {
        const where = {
          deleted_at: null,
          status: "Lost" as const,
          ...(assigned_to ? { assigned_to_id: assigned_to } : {}),
          ...(dateFilter ? { updated_at: dateFilter } : {}),
        };
        const [byReason, total, recentLost] = await Promise.all([
          prisma.lead.groupBy({
            by: ["lost_reason"],
            where,
            _count: { id: true },
            orderBy: { _count: { id: "desc" } },
          }),
          prisma.lead.count({ where }),
          prisma.lead.findMany({
            where,
            select: {
              id: true, lead_number: true, full_name: true, lost_reason: true, lost_notes: true,
              updated_at: true, assigned_to: { select: { id: true, name: true } },
            },
            orderBy: { updated_at: "desc" },
            take: 20,
          }),
        ]);
        data = {
          total_lost: total,
          by_reason: byReason.map((r) => ({
            reason: r.lost_reason ?? "Not specified",
            count: r._count.id,
            pct: total > 0 ? Math.round((r._count.id / total) * 100) : 0,
          })),
          recent_lost: recentLost,
        };
        break;
      }

      case "pipeline_by_stage": {
        const [linkStages, unlinkedStages, linkedValue, unlinkedValue] = await Promise.all([
          prisma.leadOpportunity.groupBy({
            by: ["status"],
            where: { lead: { deleted_at: null, ...(assigned_to ? { assigned_to_id: assigned_to } : {}) } },
            _count: { id: true },
            _sum: { potential_lead_value: true },
          }),
          prisma.lead.groupBy({
            by: ["status"],
            where: { deleted_at: null, opportunities: { none: {} }, ...(assigned_to ? { assigned_to_id: assigned_to } : {}) },
            _count: { id: true },
          }),
          prisma.leadOpportunity.aggregate({
            where: { status: { notIn: ["Lost", "InvalidLead"] }, lead: { deleted_at: null } },
            _sum: { potential_lead_value: true },
          }),
          prisma.lead.aggregate({
            where: { deleted_at: null, status: { notIn: ["Lost", "InvalidLead"] }, opportunities: { none: {} } },
            _sum: { potential_lead_value: true },
          }),
        ]);
        const stageCounts: Record<string, { count: number; value: number }> = {};
        for (const s of linkStages) {
          stageCounts[s.status] = {
            count: (stageCounts[s.status]?.count ?? 0) + s._count.id,
            value: (stageCounts[s.status]?.value ?? 0) + Number(s._sum.potential_lead_value ?? 0),
          };
        }
        for (const s of unlinkedStages) {
          stageCounts[s.status] = {
            count: (stageCounts[s.status]?.count ?? 0) + s._count.id,
            value: stageCounts[s.status]?.value ?? 0,
          };
        }
        data = {
          stages: Object.entries(stageCounts).map(([stage, { count, value }]) => ({ stage, count, value })),
          total_pipeline_value: Number(linkedValue._sum.potential_lead_value ?? 0) + Number(unlinkedValue._sum.potential_lead_value ?? 0),
        };
        break;
      }

      case "pipeline_by_temperature": {
        const byTemp = await prisma.lead.groupBy({
          by: ["temperature"],
          where: {
            deleted_at: null,
            status: { notIn: ["Won", "Lost", "InvalidLead"] },
            ...(assigned_to ? { assigned_to_id: assigned_to } : {}),
          },
          _count: { id: true },
          _sum: { potential_lead_value: true },
        });
        data = {
          by_temperature: byTemp.map((t) => ({
            temperature: t.temperature,
            count: t._count.id,
            pipeline_value: Number(t._sum.potential_lead_value ?? 0),
          })),
        };
        break;
      }

      case "follow_ups_overdue": {
        const now = new Date();
        const [count, items] = await Promise.all([
          prisma.followUp.count({
            where: { scheduled_at: { lt: now }, completed_at: null, ...(assigned_to ? { assigned_to_id: assigned_to } : {}) },
          }),
          prisma.followUp.findMany({
            where: { scheduled_at: { lt: now }, completed_at: null, ...(assigned_to ? { assigned_to_id: assigned_to } : {}) },
            select: {
              id: true, type: true, scheduled_at: true, attempt_count: true, no_response_count: true,
              assigned_to: { select: { id: true, name: true } },
              lead: { select: { id: true, lead_number: true, full_name: true, phone: true, temperature: true } },
            },
            orderBy: { scheduled_at: "asc" },
            take: 50,
          }),
        ]);
        data = { total_overdue: count, items };
        break;
      }

      case "revenue_summary": {
        const opps = await prisma.opportunity.findMany({
          where: { deleted_at: null },
          select: {
            id: true, opp_number: true, name: true, project: true, status: true,
            commission_percent: true, total_sales_value: true, possible_revenue: true, closed_revenue: true,
            expenses: { select: { amount: true } },
            _count: { select: { leads: true } },
          },
          orderBy: { closed_revenue: "desc" },
        });
        const enriched = opps.map((o) => {
          const total_expenses = o.expenses.reduce((s, e) => s + Number(e.amount), 0);
          const net_profit = Number(o.possible_revenue ?? 0) - total_expenses;
          return { ...o, total_expenses, net_profit };
        });
        const totals = {
          total_possible_revenue: enriched.reduce((s, o) => s + Number(o.possible_revenue ?? 0), 0),
          total_closed_revenue: enriched.reduce((s, o) => s + Number(o.closed_revenue ?? 0), 0),
          total_expenses: enriched.reduce((s, o) => s + o.total_expenses, 0),
          total_net_profit: enriched.reduce((s, o) => s + o.net_profit, 0),
        };
        data = { opportunities: enriched, totals };
        break;
      }

      case "agent_performance": {
        const agents = await prisma.user.findMany({
          where: { is_active: true, role: { in: ["Sales", "TeamLead", "Admin"] } },
          select: { id: true, name: true, role: true },
        });
        const performance = await Promise.all(
          agents.map(async (agent) => {
            const baseWhere = { deleted_at: null, assigned_to_id: agent.id, ...(dateFilter ? { updated_at: dateFilter } : {}) };
            const [total, won, lost, hot] = await Promise.all([
              prisma.lead.count({ where: baseWhere }),
              prisma.lead.count({ where: { ...baseWhere, status: "Won" } }),
              prisma.lead.count({ where: { ...baseWhere, status: "Lost" } }),
              prisma.lead.count({ where: { ...baseWhere, temperature: "Hot" } }),
            ]);
            const wonLeads = await prisma.lead.aggregate({
              where: { ...baseWhere, status: "Won" },
              _sum: { settlement_value: true },
            });
            return {
              agent: { id: agent.id, name: agent.name, role: agent.role },
              total_leads: total,
              won,
              lost,
              active: total - won - lost,
              hot_leads: hot,
              total_settlement: Number(wonLeads._sum.settlement_value ?? 0),
              win_rate: total > 0 ? Math.round((won / total) * 100) : 0,
            };
          })
        );
        data = { agents: performance.sort((a, b) => b.won - a.won) };
        break;
      }

      case "stage_changes": {
        const changes = await prisma.leadStageHistory.findMany({
          where: {
            ...(dateFilter ? { changed_at: dateFilter } : {}),
          },
          include: {
            lead: { select: { id: true, lead_number: true, full_name: true, assigned_to: { select: { id: true, name: true } } } },
            changed_by: { select: { id: true, name: true } },
          },
          orderBy: { changed_at: "desc" },
          take: 100,
        });
        const summary: Record<string, number> = {};
        for (const c of changes) {
          const key = `${c.from_stage ?? "—"} → ${c.to_stage}`;
          summary[key] = (summary[key] ?? 0) + 1;
        }
        data = {
          changes,
          summary: Object.entries(summary)
            .sort(([, a], [, b]) => b - a)
            .map(([transition, count]) => ({ transition, count })),
        };
        break;
      }

      case "recent_activity": {
        const activities = await prisma.activity.findMany({
          where: {
            ...(dateFilter ? { created_at: dateFilter } : {}),
          },
          include: { actor: { select: { id: true, name: true } } },
          orderBy: { created_at: "desc" },
          take: 50,
        });
        data = { activities };
        break;
      }
    }

    return NextResponse.json({ metric, data });
  } catch (error) {
    console.error("GET /api/mcp/analytics:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
