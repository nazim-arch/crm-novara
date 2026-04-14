import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { hasPermission, leadScopeFilter } from "@/lib/rbac";
import { startOfDay, endOfDay, subDays, differenceInCalendarDays } from "date-fns";
import { CrmDashboardClient } from "@/components/dashboard/CrmDashboardClient";

export default async function CrmDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "Operations") redirect("/tasks");

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  const userId = session.user.id;
  const role = session.user.role;
  const canViewFinancials = hasPermission(role, "financial:view");

  // Determine lead scope filter
  const leadScope = leadScopeFilter(role, userId);
  const leadWhere = (extra: object = {}) => ({
    deleted_at: null as null,
    ...(leadScope ?? {}),
    ...extra,
  });

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
    taskByClient,
  ] = await Promise.all([
    prisma.lead.count({ where: leadWhere() }),
    prisma.lead.count({ where: leadWhere({ temperature: "Hot", status: { notIn: ["Won", "Lost", "Recycle"] } }) }),
    prisma.lead.count({ where: leadWhere({ status: { notIn: ["Won", "Lost", "Recycle"] } }) }),
    prisma.lead.count({ where: leadWhere({ status: "Won" }) }),
    prisma.lead.count({ where: leadWhere({ status: { notIn: ["Won", "Lost", "Recycle"] }, next_followup_date: { gte: todayStart, lte: todayEnd } }) }),
    prisma.lead.count({ where: leadWhere({ status: { notIn: ["Won", "Lost", "Recycle"] }, next_followup_date: { lt: todayStart } }) }),
    prisma.lead.groupBy({
      by: ["status"],
      where: leadWhere(),
      _count: { id: true },
      _sum: { potential_lead_value: true },
    }),
    prisma.lead.groupBy({
      by: ["temperature"],
      where: leadWhere({ status: { notIn: ["Won", "Lost", "Recycle"] } }),
      _count: { id: true },
    }),
    prisma.lead.groupBy({
      by: ["lead_source"],
      where: leadWhere(),
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
    // Financial queries — only for Admin/financial:view
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
      where: {
        deleted_at: null,
        client_id: { not: null },
        ...(role === "Sales" || role === "Operations" ? { assigned_to_id: userId } : {}),
      },
      _count: { id: true },
    }),
  ]);

  // Resolve client names for task-by-client chart
  const clientIds = (taskByClient as Array<{ client_id: string | null }>).map((c) => c.client_id).filter(Boolean) as string[];
  const clientRecords = clientIds.length > 0
    ? await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })
    : [];
  const clientNameMap = Object.fromEntries(clientRecords.map((c) => [c.id, c.name]));
  const taskClientDistribution = (taskByClient as Array<{ client_id: string | null; _count: { id: number } }>)
    .filter((c) => c.client_id)
    .map((c) => ({ name: clientNameMap[c.client_id!] ?? "Unknown", count: c._count.id }));

  const expenseMap = new Map(
    (expensesByOpp as Array<{ opportunity_id: string; _sum: { amount: unknown } }>)
      .map((e) => [e.opportunity_id, Number(e._sum.amount ?? 0)])
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
      canViewFinancials={canViewFinancials}
      kpis={{
        totalLeads, hotLeads, activeLeads, wonLeads,
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
        id: l.id, full_name: l.full_name, lead_number: l.lead_number, phone: l.phone,
        temperature: l.temperature, status: l.status,
        potential_lead_value: l.potential_lead_value ? Number(l.potential_lead_value) : null,
        next_followup_date: l.next_followup_date?.toISOString() ?? null,
        followup_type: l.followup_type, assigned_to_name: l.assigned_to.name,
      }))}
      overdueLeads={overdueLeadsList.map((l) => ({
        id: l.id, full_name: l.full_name, lead_number: l.lead_number,
        temperature: l.temperature, status: l.status,
        potential_lead_value: l.potential_lead_value ? Number(l.potential_lead_value) : null,
        next_followup_date: l.next_followup_date?.toISOString() ?? null,
        days_overdue: l.next_followup_date ? Math.abs(differenceInCalendarDays(new Date(l.next_followup_date), todayStart)) : 0,
        assigned_to_name: l.assigned_to.name,
      }))}
      staleHotLeads={staleHotLeads.map((l) => ({
        id: l.id, full_name: l.full_name, lead_number: l.lead_number,
        potential_lead_value: l.potential_lead_value ? Number(l.potential_lead_value) : null,
        next_followup_date: l.next_followup_date?.toISOString() ?? null,
        assigned_to_name: l.assigned_to.name,
      }))}
      stageDistribution={stageDistribution.map((s) => ({ stage: s.status, count: s._count.id, value: Number(s._sum.potential_lead_value ?? 0) }))}
      temperatureDistribution={temperatureDistribution.map((t) => ({ temp: t.temperature, count: t._count.id }))}
      sourceDistribution={sourceDistribution.map((s) => ({ source: s.lead_source, count: s._count.id }))}
      topOpportunities={(topOpportunities as Array<{ id: string; name: string; opp_number: string; possible_revenue: unknown; closed_revenue: unknown; total_sales_value: unknown; commission_percent: unknown; _count: { leads: number } }>).map((o) => {
        const exp = expenseMap.get(o.id) ?? 0;
        const cr = Number(o.closed_revenue ?? 0);
        return { id: o.id, name: o.name, opp_number: o.opp_number, possible_revenue: Number(o.possible_revenue ?? 0), closed_revenue: cr, total_expense: exp, net_profit: cr - exp, leads_count: o._count.leads };
      })}
      recentActivities={recentActivities.map((a) => ({ id: a.id, action: a.action, entity_type: a.entity_type, entity_id: a.entity_id, actor_name: a.actor.name, created_at: a.created_at.toISOString() }))}
      taskStats={{ todo: taskMap["Todo"] ?? 0, inProgress: taskMap["InProgress"] ?? 0, done: taskMap["Done"] ?? 0, overdue: overdueTasksCount }}
      taskClientDistribution={taskClientDistribution}
    />
  );
}
