import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { leadScopeFilter } from "@/lib/rbac";
import { startOfDay, endOfDay, differenceInCalendarDays, subDays } from "date-fns";
import { SalesDashboardClient } from "@/components/dashboard/SalesDashboardClient";

type SearchParams = Promise<{ stale_days?: string }>;

const STALE_DEFAULT = 7;

export default async function SalesDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "Operations") redirect("/tasks");

  const sp = await searchParams;
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const staleDays = Math.max(1, Number(sp.stale_days ?? String(STALE_DEFAULT)));

  const userId = session.user.id;
  const role = session.user.role;
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

  const closedStatuses = ["Won", "Lost", "InvalidLead", "Recycle"] as const;
  const activeWhere = { status: { notIn: [...closedStatuses] } };

  const [
    totalLeads,
    hotLeads,
    _activeLeads,
    _wonLeads,
    _lostLeads,
    _newLeadsInRange,
    _wonLeadsInRange,
    todayFollowUpsCount,
    overdueFollowUpsCount,
    leadsToday,
    leadsActioned,
    pendingFirstAction,
    warmLeads,
    coldLeads,
    toActionToday,
    noActivityLeads,
    staleLeads,
    stageDistribution,
    temperatureDistribution,
    sourceDistribution,
    _pipelineAgg,
    todayLeadsList,
    overdueLeadsList,
    _staleHotLeads,
    _revenueAgg,
    _expenseAgg,
    _topOpportunities,
    _expensesByOpp,
    _oppByBreakdownRaw,
    _recentActivities,
    _taskByStatus,
    _overdueTasksCount,
    _taskByClient,
    salesOwnerGroupBy,
    leadsPerOppRaw,
    hotLeadsBySourceThisWeek,
  ] = await Promise.all([
    // All-time pipeline health
    prisma.lead.count({ where: leadWhere() }),
    prisma.lead.count({ where: leadWhere({ temperature: "Hot", ...activeWhere }) }),
    prisma.lead.count({ where: leadWhere(activeWhere) }),
    prisma.lead.count({ where: leadWhere({ status: "Won" }) }),
    prisma.lead.count({ where: leadWhere({ status: "Lost" }) }),
    // Range
    prisma.lead.count({ where: leadWhere() }),
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
      where: leadWhere(),
      _count: { id: true },
      _sum: { potential_lead_value: true },
    }),
    prisma.lead.groupBy({
      by: ["temperature"],
      where: leadWhere(activeWhere),
      _count: { id: true },
    }),
    prisma.lead.groupBy({
      by: ["lead_source"],
      where: leadWhere(),
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Sales Dashboard</h1>
        <p className="text-sm text-muted-foreground">Lead pipeline, activity &amp; action queue</p>
      </div>

      <SalesDashboardClient
        staleDays={staleDays}
        kpis={{
          totalLeads, hotLeads, warmLeads, coldLeads,
          leadsToday, leadsActioned, pendingFirstAction, toActionToday,
          todayFollowUps: todayFollowUpsCount,
          overdueFollowUps: overdueFollowUpsCount,
          noActivityLeads, staleLeads,
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
        stageDistribution={stageDistribution.map((s) => ({ stage: s.status, count: s._count.id }))}
        temperatureDistribution={temperatureDistribution.map((t) => ({ temp: t.temperature, count: t._count.id }))}
        sourceDistribution={sourceDistribution.map((s) => ({ source: s.lead_source, count: s._count.id }))}
        salesOwnerStats={salesOwnerStats}
        leadsPerOpportunity={leadsPerOpportunity}
        actionQueue={sortedActionQueue.map((l) => ({
          id: l.id, full_name: l.full_name, lead_number: l.lead_number, phone: l.phone,
          temperature: l.temperature, status: l.status,
          activity_stage: l.activity_stage, lead_source: l.lead_source,
          next_followup_date: l.next_followup_date?.toISOString() ?? null,
          updated_at: l.updated_at.toISOString(),
          assigned_to_name: l.assigned_to.name, assigned_to_id: l.assigned_to.id,
          opportunity_name: l.opportunities[0]?.opportunity.name ?? null,
          opportunity_id: l.opportunities[0]?.opportunity.id ?? null,
        }))}
        insights={insights}
      />
    </div>
  );
}
