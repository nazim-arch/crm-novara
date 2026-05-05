import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { hasPermission, leadScopeFilter } from "@/lib/rbac";
import { startOfDay, endOfDay, differenceInCalendarDays, subDays } from "date-fns";
import { CrmDashboardClient } from "@/components/dashboard/CrmDashboardClient";
import { DashboardFilters } from "@/components/podcast-studio/DashboardFilters";
import { resolveDateRange, type DashboardRange } from "@/lib/date-range";
import { Suspense } from "react";

function todayIST() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type SearchParams = Promise<{ range?: string; from?: string; to?: string; stale_days?: string }>;

const STALE_DEFAULT = 7;

export default async function CrmDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "Operations") redirect("/tasks");

  const sp = await searchParams;
  const today = new Date();
  const todayStr = todayIST();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const staleDays = Math.max(1, Number(sp.stale_days ?? String(STALE_DEFAULT)));

  const range = (sp.range ?? "current_month") as DashboardRange;
  const { start, end, label: rangeLabel } = resolveDateRange(range, todayStr, sp.from, sp.to);
  const rangeStart = new Date(start + "T00:00:00");
  const rangeEnd = new Date(end + "T23:59:59");

  const userId = session.user.id;
  const role = session.user.role;
  const canViewFinancials = hasPermission(role, "financial:view");

  const leadScope = leadScopeFilter(role, userId);

  // Base where builder — handles scope for Sales role
  const leadWhere = (extra: object = {}) => ({
    deleted_at: null as null,
    ...(leadScope ?? {}),
    ...extra,
  });

  // Where builder for queries that need their own OR clause (combines with scope via AND)
  const leadWhereWithOr = (ors: object[], extra: object = {}) => {
    if (leadScope) {
      return { deleted_at: null as null, AND: [leadScope, { OR: ors }], ...extra };
    }
    return { deleted_at: null as null, OR: ors, ...extra };
  };

  const leadWhereInRange = (extra: object = {}) => ({
    ...leadWhere(extra),
    created_at: { gte: rangeStart, lte: rangeEnd },
  });

  const closedStatuses = ["Won", "Lost", "InvalidLead", "Recycle"] as const;
  const activeWhere = { status: { notIn: [...closedStatuses] } };

  const [
    // Existing KPIs
    totalLeads,
    hotLeads,
    activeLeads,
    wonLeads,
    lostLeads,
    newLeadsInRange,
    wonLeadsInRange,
    todayFollowUpsCount,
    overdueFollowUpsCount,
    // New KPIs
    leadsToday,
    leadsActioned,
    pendingFirstAction,
    warmLeads,
    coldLeads,
    toActionToday,
    noActivityLeads,
    staleLeads,
    // Charts
    stageDistribution,
    temperatureDistribution,
    sourceDistribution,
    // Existing lists
    pipelineAgg,
    todayLeadsList,
    overdueLeadsList,
    staleHotLeads,
    revenueAgg,
    expenseAgg,
    topOpportunities,
    expensesByOpp,
    oppByBreakdownRaw,
    recentActivities,
    taskByStatus,
    overdueTasksCount,
    taskByClient,
    // New: Sales owner stats
    salesOwnerGroupBy,
    // New: Leads per opportunity
    leadsPerOppRaw,
    // New: Hot lead sources this week (for insights)
    hotLeadsBySourceThisWeek,
  ] = await Promise.all([
    // All-time pipeline health
    prisma.lead.count({ where: leadWhere() }),
    prisma.lead.count({ where: leadWhere({ temperature: "Hot", ...activeWhere }) }),
    prisma.lead.count({ where: leadWhere(activeWhere) }),
    prisma.lead.count({ where: leadWhere({ status: "Won" }) }),
    prisma.lead.count({ where: leadWhere({ status: "Lost" }) }),
    // Range
    prisma.lead.count({ where: leadWhereInRange() }),
    prisma.lead.count({ where: leadWhereInRange({ status: "Won" }) }),
    // Today follow-ups
    prisma.lead.count({ where: leadWhere({ ...activeWhere, next_followup_date: { gte: todayStart, lte: todayEnd } }) }),
    prisma.lead.count({ where: leadWhere({ ...activeWhere, next_followup_date: { lt: todayStart } }) }),

    // New KPIs
    prisma.lead.count({ where: leadWhere({ created_at: { gte: todayStart, lte: todayEnd } }) }),
    prisma.lead.count({ where: leadWhereWithOr([{ stage_history: { some: {} } }, { followups: { some: {} } }]) }),
    prisma.lead.count({ where: leadWhere({ status: "New", stage_history: { none: {} }, followups: { none: {} } }) }),
    prisma.lead.count({ where: leadWhere({ temperature: "Warm", ...activeWhere }) }),
    prisma.lead.count({ where: leadWhere({ temperature: "Cold", ...activeWhere }) }),
    prisma.lead.count({ where: leadWhereWithOr([
      { next_followup_date: { lte: todayEnd }, ...activeWhere },
      { status: "New", stage_history: { none: {} }, followups: { none: {} } },
    ]) }),
    prisma.lead.count({ where: leadWhere({ stage_history: { none: {} }, followups: { none: {} } }) }),
    prisma.lead.count({ where: leadWhere({ updated_at: { lt: subDays(todayStart, staleDays) }, ...activeWhere }) }),

    // Charts (range-filtered)
    prisma.lead.groupBy({
      by: ["status"],
      where: leadWhereInRange(),
      _count: { id: true },
      _sum: { potential_lead_value: true },
    }),
    prisma.lead.groupBy({
      by: ["temperature"],
      where: leadWhereInRange(activeWhere),
      _count: { id: true },
    }),
    prisma.lead.groupBy({
      by: ["lead_source"],
      where: leadWhereInRange(),
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 8,
    }),

    // Existing lists
    prisma.lead.aggregate({ where: leadWhere(activeWhere), _sum: { potential_lead_value: true } }),
    prisma.lead.findMany({
      where: leadWhere({ ...activeWhere, next_followup_date: { gte: todayStart, lte: todayEnd } }),
      select: { id: true, full_name: true, lead_number: true, phone: true, temperature: true, status: true, potential_lead_value: true, next_followup_date: true, followup_type: true, assigned_to: { select: { name: true } } },
      orderBy: { potential_lead_value: { sort: "desc", nulls: "last" } },
      take: 10,
    }),
    prisma.lead.findMany({
      where: leadWhere({ ...activeWhere, next_followup_date: { lt: todayStart } }),
      select: { id: true, full_name: true, lead_number: true, temperature: true, status: true, potential_lead_value: true, next_followup_date: true, assigned_to: { select: { name: true } } },
      orderBy: { potential_lead_value: { sort: "desc", nulls: "last" } },
      take: 8,
    }),
    prisma.lead.findMany({
      where: leadWhere({ temperature: "Hot", ...activeWhere, OR: [{ next_followup_date: null }, { next_followup_date: { lt: todayStart } }] }),
      select: { id: true, full_name: true, lead_number: true, potential_lead_value: true, next_followup_date: true, assigned_to: { select: { name: true } } },
      orderBy: { potential_lead_value: { sort: "desc", nulls: "last" } },
      take: 5,
    }),
    canViewFinancials
      ? prisma.opportunity.aggregate({ where: { deleted_at: null }, _sum: { total_sales_value: true, possible_revenue: true, closed_revenue: true } })
      : Promise.resolve({ _sum: { total_sales_value: null, possible_revenue: null, closed_revenue: null } }),
    canViewFinancials
      ? prisma.opportunityExpense.aggregate({ where: { opportunity: { deleted_at: null } }, _sum: { amount: true } })
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
      ? prisma.opportunityExpense.groupBy({ by: ["opportunity_id"], where: { opportunity: { deleted_at: null } }, _sum: { amount: true } })
      : Promise.resolve([]),
    canViewFinancials
      ? prisma.opportunity.groupBy({ by: ["opportunity_by"], where: { deleted_at: null }, _count: { id: true }, _sum: { possible_revenue: true } })
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
      where: { deleted_at: null, status: { notIn: ["Done", "Cancelled"] }, due_date: { lt: todayStart }, ...(role === "Sales" || role === "Operations" ? { assigned_to_id: userId } : {}) },
    }),
    prisma.task.groupBy({
      by: ["client_id"],
      where: { deleted_at: null, client_id: { not: null }, ...(role === "Sales" || role === "Operations" ? { assigned_to_id: userId } : {}) },
      _count: { id: true },
    }),

    // Sales owner stats
    prisma.lead.groupBy({
      by: ["assigned_to_id"],
      where: leadWhere(activeWhere),
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),

    // Leads per opportunity (top 8)
    prisma.leadOpportunity.groupBy({
      by: ["opportunity_id"],
      _count: { lead_id: true },
      orderBy: { _count: { lead_id: "desc" } },
      take: 8,
    }),

    // Hot lead sources this week (for smart insights)
    prisma.lead.groupBy({
      by: ["lead_source"],
      where: leadWhere({
        temperature: "Hot",
        created_at: { gte: subDays(todayStart, 7) },
      }),
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 1,
    }),
  ]);

  // Resolve sales owner names
  const ownerIds = (salesOwnerGroupBy as Array<{ assigned_to_id: string; _count: { id: number } }>)
    .map((r) => r.assigned_to_id).filter(Boolean);
  const ownerUsers = ownerIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })
    : [];
  const ownerNameMap = Object.fromEntries(ownerUsers.map((u) => [u.id, u.name]));
  const salesOwnerStats = (salesOwnerGroupBy as Array<{ assigned_to_id: string; _count: { id: number } }>)
    .map((r) => ({ id: r.assigned_to_id, name: ownerNameMap[r.assigned_to_id] ?? "Unknown", count: r._count.id }));

  // Resolve opportunity names for leads-per-opp
  const oppIds = (leadsPerOppRaw as Array<{ opportunity_id: string; _count: { lead_id: number } }>)
    .map((r) => r.opportunity_id).filter(Boolean);
  const oppRecords = oppIds.length > 0
    ? await prisma.opportunity.findMany({ where: { id: { in: oppIds }, deleted_at: null }, select: { id: true, name: true } })
    : [];
  const oppNameMap = Object.fromEntries(oppRecords.map((o) => [o.id, o.name]));
  const leadsPerOpportunity = (leadsPerOppRaw as Array<{ opportunity_id: string; _count: { lead_id: number } }>)
    .map((r) => ({ id: r.opportunity_id, name: oppNameMap[r.opportunity_id] ?? "Unknown", count: r._count.lead_id }))
    .filter((r) => r.name !== "Unknown");

  // Action queue: prioritized list of leads needing attention today
  const TEMP_PRIO: Record<string, number> = { Hot: 0, Warm: 1, Cold: 2, FollowUpLater: 3 };
  const actionQueueLeads = await prisma.lead.findMany({
    where: leadWhereWithOr([
      { next_followup_date: { lte: todayEnd }, ...activeWhere },
      { status: "New", stage_history: { none: {} }, followups: { none: {} } },
      { updated_at: { lt: subDays(todayStart, staleDays) }, ...activeWhere },
    ]),
    select: {
      id: true, full_name: true, lead_number: true, phone: true,
      temperature: true, status: true, activity_stage: true,
      next_followup_date: true, updated_at: true, lead_source: true,
      assigned_to: { select: { id: true, name: true } },
      opportunities: {
        select: { opportunity: { select: { id: true, name: true } } },
        take: 1,
        orderBy: { tagged_at: "desc" },
      },
    },
    take: 30,
    orderBy: { updated_at: "asc" },
  });
  const sortedActionQueue = [...actionQueueLeads].sort((a, b) => {
    const pa = TEMP_PRIO[a.temperature ?? "Cold"] ?? 3;
    const pb = TEMP_PRIO[b.temperature ?? "Cold"] ?? 3;
    if (pa !== pb) return pa - pb;
    const aOverdue = a.next_followup_date && new Date(a.next_followup_date) < todayStart;
    const bOverdue = b.next_followup_date && new Date(b.next_followup_date) < todayStart;
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    return 0;
  }).slice(0, 20);

  // Smart insights
  const topHotSource = (hotLeadsBySourceThisWeek as Array<{ lead_source: string | null; _count: { id: number } }>)[0];
  const insights: string[] = [];
  if (noActivityLeads > 0) insights.push(`${noActivityLeads} lead${noActivityLeads > 1 ? "s" : ""} have not been contacted yet.`);
  if (topHotSource?.lead_source && topHotSource._count.id > 0)
    insights.push(`${topHotSource.lead_source} generated ${topHotSource._count.id} hot lead${topHotSource._count.id > 1 ? "s" : ""} this week.`);
  if (overdueFollowUpsCount > 0) insights.push(`${overdueFollowUpsCount} overdue follow-up${overdueFollowUpsCount > 1 ? "s" : ""} need attention today.`);
  if (staleLeads > 0) insights.push(`${staleLeads} lead${staleLeads > 1 ? "s" : ""} haven't had activity in ${staleDays}+ days.`);
  if (warmLeads > 0 && hotLeads > 0 && warmLeads > hotLeads) insights.push(`${warmLeads} warm leads ready to be moved to hot.`);
  if (pendingFirstAction > 0) insights.push(`${pendingFirstAction} new lead${pendingFirstAction > 1 ? "s" : ""} awaiting first contact.`);

  // Existing computations
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

  const opportunityByBreakdown = (oppByBreakdownRaw as Array<{ opportunity_by: string | null; _count: { id: number }; _sum: { possible_revenue: unknown } }>)
    .map((r) => ({ opportunity_by: r.opportunity_by ?? "Developer", count: r._count.id, possible_revenue: Number(r._sum.possible_revenue ?? 0) }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Lead Management Dashboard</h1>
        <p className="text-sm text-muted-foreground">Pipeline health, activity &amp; action queue</p>
      </div>

      <Suspense>
        <DashboardFilters currentRange={range} currentFrom={sp.from} currentTo={sp.to} rangeLabel={rangeLabel} />
      </Suspense>

      <CrmDashboardClient
        canViewFinancials={canViewFinancials}
        rangeLabel={rangeLabel}
        staleDays={staleDays}
        kpis={{
          totalLeads, hotLeads, activeLeads, wonLeads, lostLeads,
          newLeadsInRange, wonLeadsInRange,
          todayFollowUps: todayFollowUpsCount,
          overdueFollowUps: overdueFollowUpsCount,
          pipelineValue,
          totalSalesValue,
          possibleRevenue,
          closedRevenue,
          totalExpense,
          netProfit,
          leadsToday,
          leadsActioned,
          pendingFirstAction,
          warmLeads,
          coldLeads,
          toActionToday,
          noActivityLeads,
          staleLeads,
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
        opportunityByBreakdown={opportunityByBreakdown}
        recentActivities={recentActivities.map((a) => ({ id: a.id, action: a.action, entity_type: a.entity_type, entity_id: a.entity_id, actor_name: a.actor.name, created_at: a.created_at.toISOString() }))}
        taskStats={{ todo: taskMap["Todo"] ?? 0, inProgress: taskMap["InProgress"] ?? 0, done: taskMap["Done"] ?? 0, overdue: overdueTasksCount }}
        taskClientDistribution={taskClientDistribution}
        salesOwnerStats={salesOwnerStats}
        leadsPerOpportunity={leadsPerOpportunity}
        actionQueue={sortedActionQueue.map((l) => ({
          id: l.id,
          full_name: l.full_name,
          lead_number: l.lead_number,
          phone: l.phone,
          temperature: l.temperature,
          status: l.status,
          activity_stage: l.activity_stage,
          lead_source: l.lead_source,
          next_followup_date: l.next_followup_date?.toISOString() ?? null,
          updated_at: l.updated_at.toISOString(),
          assigned_to_name: l.assigned_to.name,
          assigned_to_id: l.assigned_to.id,
          opportunity_name: l.opportunities[0]?.opportunity.name ?? null,
          opportunity_id: l.opportunities[0]?.opportunity.id ?? null,
        }))}
        insights={insights}
      />
    </div>
  );
}
