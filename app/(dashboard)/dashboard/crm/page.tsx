import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/rbac";
import { startOfDay, endOfDay, subDays, differenceInCalendarDays } from "date-fns";
import { CrmDashboardClient } from "@/components/dashboard/CrmDashboardClient";

export default async function CrmDashboardPage() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "report:view")) {
    redirect("/tasks");
  }

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const staleThreshold = subDays(todayStart, 3); // hot lead not touched in 3+ days

  const [
    totalLeads,
    hotLeads,
    activeLeads,
    wonLeads,
    todayFollowUpsCount,
    overdueFollowUpsCount,
    stageDistribution,
    temperatureDistribution,
    sourceDistribution,
    pipelineAgg,
    todayLeadsList,
    overdueLeadsList,
    staleHotLeads,
    revenueAgg,
    expenseAgg,
    topOpportunities,
    expensesByOpp,
    recentActivities,
    taskByStatus,
    overdueTasksCount,
  ] = await Promise.all([
    // ── Lead counts ──────────────────────────────────────────
    prisma.lead.count({ where: { deleted_at: null } }),

    prisma.lead.count({
      where: { deleted_at: null, temperature: "Hot", status: { notIn: ["Won", "Lost", "Recycle"] } },
    }),

    prisma.lead.count({
      where: { deleted_at: null, status: { notIn: ["Won", "Lost", "Recycle"] } },
    }),

    prisma.lead.count({ where: { deleted_at: null, status: "Won" } }),

    // ── Follow-up counts ─────────────────────────────────────
    prisma.lead.count({
      where: {
        deleted_at: null,
        status: { notIn: ["Won", "Lost", "Recycle"] },
        next_followup_date: { gte: todayStart, lte: todayEnd },
      },
    }),

    prisma.lead.count({
      where: {
        deleted_at: null,
        status: { notIn: ["Won", "Lost", "Recycle"] },
        next_followup_date: { lt: todayStart },
      },
    }),

    // ── Distributions ────────────────────────────────────────
    prisma.lead.groupBy({
      by: ["status"],
      where: { deleted_at: null },
      _count: { id: true },
      _sum: { potential_lead_value: true },
    }),

    prisma.lead.groupBy({
      by: ["temperature"],
      where: { deleted_at: null, status: { notIn: ["Won", "Lost", "Recycle"] } },
      _count: { id: true },
    }),

    prisma.lead.groupBy({
      by: ["lead_source"],
      where: { deleted_at: null },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 8,
    }),

    // ── Aggregates ───────────────────────────────────────────
    prisma.lead.aggregate({
      where: { deleted_at: null, status: { notIn: ["Lost", "Recycle"] } },
      _sum: { potential_lead_value: true },
    }),

    // ── Today's follow-up leads ──────────────────────────────
    prisma.lead.findMany({
      where: {
        deleted_at: null,
        status: { notIn: ["Won", "Lost", "Recycle"] },
        next_followup_date: { gte: todayStart, lte: todayEnd },
      },
      select: {
        id: true,
        full_name: true,
        lead_number: true,
        phone: true,
        temperature: true,
        status: true,
        potential_lead_value: true,
        next_followup_date: true,
        followup_type: true,
        assigned_to: { select: { name: true } },
      },
      orderBy: { potential_lead_value: { sort: "desc", nulls: "last" } },
      take: 10,
    }),

    // ── Overdue high-value leads ─────────────────────────────
    prisma.lead.findMany({
      where: {
        deleted_at: null,
        status: { notIn: ["Won", "Lost", "Recycle"] },
        next_followup_date: { lt: todayStart },
      },
      select: {
        id: true,
        full_name: true,
        lead_number: true,
        temperature: true,
        status: true,
        potential_lead_value: true,
        next_followup_date: true,
        assigned_to: { select: { name: true } },
      },
      orderBy: { potential_lead_value: { sort: "desc", nulls: "last" } },
      take: 8,
    }),

    // ── Stale hot leads ──────────────────────────────────────
    prisma.lead.findMany({
      where: {
        deleted_at: null,
        temperature: "Hot",
        status: { notIn: ["Won", "Lost", "Recycle"] },
        OR: [
          { next_followup_date: null },
          { next_followup_date: { lt: todayStart } },
        ],
      },
      select: {
        id: true,
        full_name: true,
        lead_number: true,
        potential_lead_value: true,
        next_followup_date: true,
        assigned_to: { select: { name: true } },
      },
      orderBy: { potential_lead_value: { sort: "desc", nulls: "last" } },
      take: 5,
    }),

    // ── Revenue aggregation ──────────────────────────────────
    prisma.opportunity.aggregate({
      where: { deleted_at: null },
      _sum: { total_sales_value: true, possible_revenue: true, closed_revenue: true },
    }),

    // ── Total expenses ───────────────────────────────────────
    prisma.opportunityExpense.aggregate({
      _sum: { amount: true },
    }),

    // ── Top 5 opportunities ──────────────────────────────────
    prisma.opportunity.findMany({
      where: { deleted_at: null, status: "Active" },
      select: {
        id: true,
        name: true,
        opp_number: true,
        possible_revenue: true,
        closed_revenue: true,
        total_sales_value: true,
        commission_percent: true,
        _count: { select: { leads: true } },
      },
      orderBy: { possible_revenue: { sort: "desc", nulls: "last" } },
      take: 5,
    }),

    // ── Expenses grouped by opportunity ──────────────────────
    prisma.opportunityExpense.groupBy({
      by: ["opportunity_id"],
      _sum: { amount: true },
    }),

    // ── Recent activities ────────────────────────────────────
    prisma.activity.findMany({
      include: { actor: { select: { name: true } } },
      orderBy: { created_at: "desc" },
      take: 15,
    }),

    // ── Task stats ───────────────────────────────────────────
    prisma.task.groupBy({
      by: ["status"],
      where: { deleted_at: null },
      _count: { id: true },
    }),

    prisma.task.count({
      where: {
        deleted_at: null,
        status: { notIn: ["Done", "Cancelled"] },
        due_date: { lt: todayStart },
      },
    }),
  ]);

  // ── Serialize & shape data ──────────────────────────────────────

  const expenseMap = new Map(
    expensesByOpp.map((e) => [e.opportunity_id, Number(e._sum.amount ?? 0)])
  );

  const totalExpense = Number(expenseAgg._sum.amount ?? 0);
  const closedRevenue = Number(revenueAgg._sum.closed_revenue ?? 0);
  const possibleRevenue = Number(revenueAgg._sum.possible_revenue ?? 0);
  const totalSalesValue = Number(revenueAgg._sum.total_sales_value ?? 0);
  const pipelineValue = Number(pipelineAgg._sum.potential_lead_value ?? 0);
  const netProfit = closedRevenue - totalExpense;

  const taskMap: Record<string, number> = {};
  for (const t of taskByStatus) taskMap[t.status] = t._count.id;

  return (
    <CrmDashboardClient
      kpis={{
        totalLeads,
        hotLeads,
        activeLeads,
        wonLeads,
        todayFollowUps: todayFollowUpsCount,
        overdueFollowUps: overdueFollowUpsCount,
        pipelineValue,
        totalSalesValue,
        possibleRevenue,
        closedRevenue,
        totalExpense,
        netProfit,
      }}
      todayLeads={todayLeadsList.map((l) => ({
        id: l.id,
        full_name: l.full_name,
        lead_number: l.lead_number,
        phone: l.phone,
        temperature: l.temperature,
        status: l.status,
        potential_lead_value: l.potential_lead_value ? Number(l.potential_lead_value) : null,
        next_followup_date: l.next_followup_date?.toISOString() ?? null,
        followup_type: l.followup_type,
        assigned_to_name: l.assigned_to.name,
      }))}
      overdueLeads={overdueLeadsList.map((l) => ({
        id: l.id,
        full_name: l.full_name,
        lead_number: l.lead_number,
        temperature: l.temperature,
        status: l.status,
        potential_lead_value: l.potential_lead_value ? Number(l.potential_lead_value) : null,
        next_followup_date: l.next_followup_date?.toISOString() ?? null,
        days_overdue: l.next_followup_date
          ? Math.abs(differenceInCalendarDays(new Date(l.next_followup_date), todayStart))
          : 0,
        assigned_to_name: l.assigned_to.name,
      }))}
      staleHotLeads={staleHotLeads.map((l) => ({
        id: l.id,
        full_name: l.full_name,
        lead_number: l.lead_number,
        potential_lead_value: l.potential_lead_value ? Number(l.potential_lead_value) : null,
        next_followup_date: l.next_followup_date?.toISOString() ?? null,
        assigned_to_name: l.assigned_to.name,
      }))}
      stageDistribution={stageDistribution.map((s) => ({
        stage: s.status,
        count: s._count.id,
        value: Number(s._sum.potential_lead_value ?? 0),
      }))}
      temperatureDistribution={temperatureDistribution.map((t) => ({
        temp: t.temperature,
        count: t._count.id,
      }))}
      sourceDistribution={sourceDistribution.map((s) => ({
        source: s.lead_source,
        count: s._count.id,
      }))}
      topOpportunities={topOpportunities.map((o) => {
        const exp = expenseMap.get(o.id) ?? 0;
        const cr = Number(o.closed_revenue ?? 0);
        return {
          id: o.id,
          name: o.name,
          opp_number: o.opp_number,
          possible_revenue: Number(o.possible_revenue ?? 0),
          closed_revenue: cr,
          total_expense: exp,
          net_profit: cr - exp,
          leads_count: o._count.leads,
        };
      })}
      recentActivities={recentActivities.map((a) => ({
        id: a.id,
        action: a.action,
        entity_type: a.entity_type,
        entity_id: a.entity_id,
        actor_name: a.actor.name,
        created_at: a.created_at.toISOString(),
      }))}
      taskStats={{
        todo: taskMap["Todo"] ?? 0,
        inProgress: taskMap["InProgress"] ?? 0,
        done: taskMap["Done"] ?? 0,
        overdue: overdueTasksCount,
      }}
    />
  );
}
