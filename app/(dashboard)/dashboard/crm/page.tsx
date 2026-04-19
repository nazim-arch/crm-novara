import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { hasPermission, leadScopeFilter } from "@/lib/rbac";
import { startOfDay, endOfDay, differenceInCalendarDays } from "date-fns";
import { CrmDashboardClient } from "@/components/dashboard/CrmDashboardClient";
import { DashboardFilters } from "@/components/podcast-studio/DashboardFilters";
import { resolveDateRange, type DashboardRange } from "@/lib/date-range";
import { Suspense } from "react";

function todayIST() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type SearchParams = Promise<{ range?: string; from?: string; to?: string }>;

export default async function CrmDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "Operations") redirect("/tasks");

  const sp = await searchParams;
  const today = new Date();
  const todayStr = todayIST();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  const range = (sp.range ?? "current_month") as DashboardRange;
  const { start, end, label: rangeLabel } = resolveDateRange(range, todayStr, sp.from, sp.to);
  const rangeStart = new Date(start + "T00:00:00");
  const rangeEnd = new Date(end + "T23:59:59");

  const userId = session.user.id;
  const role = session.user.role;
  const canViewFinancials = hasPermission(role, "financial:view");

  const leadScope = leadScopeFilter(role, userId);
  const leadWhere = (extra: object = {}) => ({
    deleted_at: null as null,
    ...(leadScope ?? {}),
    ...extra,
  });

  // Date-ranged lead where — filters by created_at within range
  const leadWhereInRange = (extra: object = {}) => ({
    ...leadWhere(extra),
    created_at: { gte: rangeStart, lte: rangeEnd },
  });

  const [
    totalLeads,
    hotLeads,
    activeLeads,
    wonLeads,
    // Range-filtered metrics
    newLeadsInRange,
    wonLeadsInRange,
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
    taskByClient,
  ] = await Promise.all([
    // All-time counts (pipeline health)
    prisma.lead.count({ where: leadWhere() }),
    prisma.lead.count({ where: leadWhere({ temperature: "Hot", status: { notIn: ["Won", "Lost", "Recycle"] } }) }),
    prisma.lead.count({ where: leadWhere({ status: { notIn: ["Won", "Lost", "Recycle"] } }) }),
    prisma.lead.count({ where: leadWhere({ status: "Won" }) }),
    // Range-filtered
    prisma.lead.count({ where: leadWhereInRange() }),
    prisma.lead.count({ where: leadWhereInRange({ status: "Won" }) }),
    // Today follow-ups (always today-based)
    prisma.lead.count({ where: leadWhere({ status: { notIn: ["Won", "Lost", "Recycle"] }, next_followup_date: { gte: todayStart, lte: todayEnd } }) }),
    prisma.lead.count({ where: leadWhere({ status: { notIn: ["Won", "Lost", "Recycle"] }, next_followup_date: { lt: todayStart } }) }),
    // Charts — filtered by range
    prisma.lead.groupBy({
      by: ["status"],
      where: leadWhereInRange(),
      _count: { id: true },
      _sum: { potential_lead_value: true },
    }),
    prisma.lead.groupBy({
      by: ["temperature"],
      where: leadWhereInRange({ status: { notIn: ["Won", "Lost", "Recycle"] } }),
      _count: { id: true },
    }),
    prisma.lead.groupBy({
      by: ["lead_source"],
      where: leadWhereInRange(),
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 8,
    }),
    prisma.lead.aggregate({
      where: leadWhere({ status: { notIn: ["Lost", "Recycle"] } }),
      _sum: { potential_lead_value: true },
    }),
    prisma.lead.findMany({
      where: leadWhere({ status: { notIn: ["Won", "Lost", "Recycle"] }, next_followup_date: { gte: todayStart, lte: todayEnd } }),
      select: { id: true, full_name: true, lead_number: true, phone: true, temperature: true, status: true, potential_lead_value: true, next_followup_date: true, followup_type: true, assigned_to: { select: { name: true } } },
      orderBy: { potential_lead_value: { sort: "desc", nulls: "last" } },
      take: 10,
    }),
    prisma.lead.findMany({
      where: leadWhere({ status: { notIn: ["Won", "Lost", "Recycle"] }, next_followup_date: { lt: todayStart } }),
      select: { id: true, full_name: true, lead_number: true, temperature: true, status: true, potential_lead_value: true, next_followup_date: true, assigned_to: { select: { name: true } } },
      orderBy: { potential_lead_value: { sort: "desc", nulls: "last" } },
      take: 8,
    }),
    prisma.lead.findMany({
      where: leadWhere({ temperature: "Hot", status: { notIn: ["Won", "Lost", "Recycle"] }, OR: [{ next_followup_date: null }, { next_followup_date: { lt: todayStart } }] }),
      select: { id: true, full_name: true, lead_number: true, potential_lead_value: true, next_followup_date: true, assigned_to: { select: { name: true } } },
      orderBy: { potential_lead_value: { sort: "desc", nulls: "last" } },
      take: 5,
    }),
    canViewFinancials
      ? prisma.opportunity.aggregate({ where: { deleted_at: null }, _sum: { total_sales_value: true, possible_revenue: true, closed_revenue: true } })
      : Promise.resolve({ _sum: { total_sales_value: null, possible_revenue: null, closed_revenue: null } }),
    canViewFinancials
      ? prisma.opportunityExpense.aggregate({ _sum: { amount: true } })
      : Promise.resolve({ _sum: { amount: null } }),
    canViewFinancials
      ? prisma.opportunity.findMany({
          where: { deleted_at: null, status: "Active" },
          select: { id: true, name: true, opp_number: true, possible_revenue: true, closed_revenue: true, total_sales_value: true, commission_percent: true, _count: { select: { leads: true } } },
          orderBy: { possible_revenue: { sort: "desc", nulls: "last" } },
          take: 5,
        })
      : Promise.resolve([]),
    canViewFinancials
      ? prisma.opportunityExpense.groupBy({ by: ["opportunity_id"], _sum: { amount: true } })
      : Promise.resolve([]),
    prisma.activity.findMany({
      include: { actor: { select: { name: true } } },
      orderBy: { created_at: "desc" },
      take: 15,
    }),
    prisma.task.groupBy({
      by: ["status"],
      where: { deleted_at: null, ...(role === "Sales" || role === "Operations" ? { assigned_to_id: userId } : {}) },
      _count: { id: true },
    }),
    prisma.task.count({
      where: {
        deleted_at: null, status: { notIn: ["Done", "Cancelled"] }, due_date: { lt: todayStart },
        ...(role === "Sales" || role === "Operations" ? { assigned_to_id: userId } : {}),
      },
    }),
    prisma.task.groupBy({
      by: ["client_id"],
      where: { deleted_at: null, client_id: { not: null }, ...(role === "Sales" || role === "Operations" ? { assigned_to_id: userId } : {}) },
      _count: { id: true },
    }),
  ]);

  const clientIds = (taskByClient as Array<{ client_id: string | null }>).map(c => c.client_id).filter(Boolean) as string[];
  const clientRecords = clientIds.length > 0
    ? await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })
    : [];
  const clientNameMap = Object.fromEntries(clientRecords.map(c => [c.id, c.name]));
  const taskClientDistribution = (taskByClient as Array<{ client_id: string | null; _count: { id: number } }>)
    .filter(c => c.client_id)
    .map(c => ({ name: clientNameMap[c.client_id!] ?? "Unknown", count: c._count.id }));

  const expenseMap = new Map(
    (expensesByOpp as Array<{ opportunity_id: string; _sum: { amount: unknown } }>)
      .map(e => [e.opportunity_id, Number(e._sum.amount ?? 0)])
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
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">CRM Overview</h1>
        <p className="text-sm text-muted-foreground">Pipeline health &amp; activity</p>
      </div>

      <Suspense>
        <DashboardFilters currentRange={range} currentFrom={sp.from} currentTo={sp.to} rangeLabel={rangeLabel} />
      </Suspense>

      <CrmDashboardClient
        canViewFinancials={canViewFinancials}
        rangeLabel={rangeLabel}
        kpis={{
          totalLeads, hotLeads, activeLeads, wonLeads,
          newLeadsInRange, wonLeadsInRange,
          todayFollowUps: todayFollowUpsCount,
          overdueFollowUps: overdueFollowUpsCount,
          pipelineValue,
          totalSalesValue,
          possibleRevenue,
          closedRevenue,
          totalExpense,
          netProfit,
        }}
        todayLeads={todayLeadsList.map(l => ({
          id: l.id, full_name: l.full_name, lead_number: l.lead_number, phone: l.phone,
          temperature: l.temperature, status: l.status,
          potential_lead_value: l.potential_lead_value ? Number(l.potential_lead_value) : null,
          next_followup_date: l.next_followup_date?.toISOString() ?? null,
          followup_type: l.followup_type, assigned_to_name: l.assigned_to.name,
        }))}
        overdueLeads={overdueLeadsList.map(l => ({
          id: l.id, full_name: l.full_name, lead_number: l.lead_number,
          temperature: l.temperature, status: l.status,
          potential_lead_value: l.potential_lead_value ? Number(l.potential_lead_value) : null,
          next_followup_date: l.next_followup_date?.toISOString() ?? null,
          days_overdue: l.next_followup_date ? Math.abs(differenceInCalendarDays(new Date(l.next_followup_date), todayStart)) : 0,
          assigned_to_name: l.assigned_to.name,
        }))}
        staleHotLeads={staleHotLeads.map(l => ({
          id: l.id, full_name: l.full_name, lead_number: l.lead_number,
          potential_lead_value: l.potential_lead_value ? Number(l.potential_lead_value) : null,
          next_followup_date: l.next_followup_date?.toISOString() ?? null,
          assigned_to_name: l.assigned_to.name,
        }))}
        stageDistribution={stageDistribution.map(s => ({ stage: s.status, count: s._count.id, value: Number(s._sum.potential_lead_value ?? 0) }))}
        temperatureDistribution={temperatureDistribution.map(t => ({ temp: t.temperature, count: t._count.id }))}
        sourceDistribution={sourceDistribution.map(s => ({ source: s.lead_source, count: s._count.id }))}
        topOpportunities={(topOpportunities as Array<{ id: string; name: string; opp_number: string; possible_revenue: unknown; closed_revenue: unknown; total_sales_value: unknown; commission_percent: unknown; _count: { leads: number } }>).map(o => {
          const exp = expenseMap.get(o.id) ?? 0;
          const cr = Number(o.closed_revenue ?? 0);
          return { id: o.id, name: o.name, opp_number: o.opp_number, possible_revenue: Number(o.possible_revenue ?? 0), closed_revenue: cr, total_expense: exp, net_profit: cr - exp, leads_count: o._count.leads };
        })}
        recentActivities={recentActivities.map(a => ({ id: a.id, action: a.action, entity_type: a.entity_type, entity_id: a.entity_id, actor_name: a.actor.name, created_at: a.created_at.toISOString() }))}
        taskStats={{ todo: taskMap["Todo"] ?? 0, inProgress: taskMap["InProgress"] ?? 0, done: taskMap["Done"] ?? 0, overdue: overdueTasksCount }}
        taskClientDistribution={taskClientDistribution}
      />
    </div>
  );
}
