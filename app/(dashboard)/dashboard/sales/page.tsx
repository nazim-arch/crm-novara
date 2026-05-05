import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { leadScopeFilter } from "@/lib/rbac";
import { startOfDay, endOfDay, subDays, differenceInCalendarDays } from "date-fns";
import { SalesDashboardClient } from "@/components/dashboard/SalesDashboardClient";

// ── Period resolution ──────────────────────────────────────────────────────

type SalesPeriod = "today" | "yesterday" | "this_week" | "this_month" | "ytd" | "custom";

function resolveSalesPeriod(
  period: string,
  from: string | undefined,
  to: string | undefined,
  today: Date,
): { rangeStart: Date; rangeEnd: Date; label: string; period: SalesPeriod } {
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  switch (period as SalesPeriod) {
    case "today":
      return { rangeStart: todayStart, rangeEnd: todayEnd, label: "Today", period: "today" };
    case "yesterday": {
      const yd = subDays(todayStart, 1);
      return { rangeStart: startOfDay(yd), rangeEnd: endOfDay(yd), label: "Yesterday", period: "yesterday" };
    }
    case "this_week": {
      const dow = today.getDay();
      const daysToMon = dow === 0 ? 6 : dow - 1;
      const weekStart = startOfDay(subDays(today, daysToMon));
      return { rangeStart: weekStart, rangeEnd: todayEnd, label: "This Week", period: "this_week" };
    }
    case "this_month": {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return { rangeStart: startOfDay(monthStart), rangeEnd: todayEnd, label: "This Month", period: "this_month" };
    }
    case "ytd": {
      const yearStart = new Date(today.getFullYear(), 0, 1);
      return { rangeStart: startOfDay(yearStart), rangeEnd: todayEnd, label: `YTD ${today.getFullYear()}`, period: "ytd" };
    }
    case "custom": {
      const s = from ? new Date(from + "T00:00:00") : todayStart;
      const e = to ? new Date(to + "T23:59:59") : todayEnd;
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const label = `${s.getDate()} ${months[s.getMonth()]} – ${e.getDate()} ${months[e.getMonth()]} ${e.getFullYear()}`;
      return { rangeStart: s, rangeEnd: e, label, period: "custom" };
    }
    default: {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return { rangeStart: startOfDay(monthStart), rangeEnd: todayEnd, label: "This Month", period: "this_month" };
    }
  }
}

// ── Page ───────────────────────────────────────────────────────────────────

type SearchParams = Promise<{ period?: string; from?: string; to?: string; stale_days?: string }>;

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

  const { rangeStart, rangeEnd, label: rangeLabel, period } = resolveSalesPeriod(
    sp.period ?? "this_month",
    sp.from,
    sp.to,
    today,
  );

  const userId = session.user.id;
  const role = session.user.role;
  const leadScope = leadScopeFilter(role, userId);

  const leadWhere = (extra: object = {}): object => ({
    deleted_at: null as null,
    ...(leadScope ?? {}),
    ...extra,
  });

  // Combines Sales scope OR with filter OR safely using AND
  const leadWhereWithOr = (ors: object[], extra: object = {}): object => {
    if (leadScope) {
      return { deleted_at: null as null, AND: [leadScope, { OR: ors }], ...extra };
    }
    return { deleted_at: null as null, OR: ors, ...extra };
  };

  const closedStatuses = ["Won", "Lost", "InvalidLead", "Recycle"];
  const activeFilter = { status: { notIn: closedStatuses } };
  const periodFilter = { created_at: { gte: rangeStart, lte: rangeEnd } };

  // ── Parallel queries ───────────────────────────────────────────────────────
  const [
    // Period KPIs
    leadsReceived,
    leadsActioned,
    // Live KPIs
    hotLeads,
    warmLeads,
    coldLeads,
    pendingFirstAction,
    staleLeads,
    toActionToday,
    todayFollowUpsCount,
    overdueFollowUpsCount,
    noActivityLeads,
    // Charts (all-time)
    stageDistribution,
    temperatureDistribution,
    // Charts (period)
    sourceDistribution,
    // Lists (live)
    todayLeadsList,
    overdueLeadsList,
    // Sales owner & opportunity (all-time active)
    salesOwnerGroupBy,
    leadsPerOppRaw,
    // Insights: hot sources in period
    hotLeadsBySource,
    // Won in period via stage history
    wonInPeriod,
  ] = await Promise.all([
    // ── Period: received ──────────────────────────────────────────────────
    prisma.lead.count({ where: leadWhere(periodFilter) }),

    // ── Period: actioned (created in period AND has real stage change or follow-up)
    // Lead creation auto-inserts stage_history with from_stage=null (initial entry).
    // "Actioned" = someone actually worked on it: from_stage IS NOT NULL means a
    // real stage transition happened, or a follow-up was created.
    prisma.lead.count({
      where: leadWhereWithOr(
        [
          { stage_history: { some: { from_stage: { not: null } } } },
          { followups: { some: {} } },
        ],
        periodFilter,
      ),
    }),

    // ── Live: temperature breakdown (active pipeline) ─────────────────────
    prisma.lead.count({ where: leadWhere({ temperature: "Hot", ...activeFilter }) }),
    prisma.lead.count({ where: leadWhere({ temperature: "Warm", ...activeFilter }) }),
    prisma.lead.count({ where: leadWhere({ temperature: "Cold", ...activeFilter }) }),

    // ── Live: never actioned (no real stage transition, no follow-ups) ────
    prisma.lead.count({
      where: leadWhere({
        stage_history: { none: { from_stage: { not: null } } },
        followups: { none: {} },
      }),
    }),

    // ── Live: stale (active, no update in N days) ─────────────────────────
    prisma.lead.count({
      where: leadWhere({ ...activeFilter, updated_at: { lt: subDays(todayStart, staleDays) } }),
    }),

    // ── Live: to action today (today follow-up OR overdue OR pending) ─────
    prisma.lead.count({
      where: leadWhereWithOr([
        { next_followup_date: { lte: todayEnd }, ...activeFilter },
        { stage_history: { none: { from_stage: { not: null } } }, followups: { none: {} } },
      ]),
    }),

    // ── Live: today follow-ups ────────────────────────────────────────────
    prisma.lead.count({
      where: leadWhere({ ...activeFilter, next_followup_date: { gte: todayStart, lte: todayEnd } }),
    }),

    // ── Live: overdue follow-ups ──────────────────────────────────────────
    prisma.lead.count({
      where: leadWhere({ ...activeFilter, next_followup_date: { lt: todayStart } }),
    }),

    // ── Live: no activity (no real stage transition, no follow-ups) ───────
    prisma.lead.count({
      where: leadWhere({
        stage_history: { none: { from_stage: { not: null } } },
        followups: { none: {} },
      }),
    }),

    // ── Chart: stage funnel (all-time scoped) ─────────────────────────────
    prisma.lead.groupBy({
      by: ["status"],
      where: leadWhere(),
      _count: { id: true },
      _sum: { potential_lead_value: true },
    }),

    // ── Chart: temperature (active pipeline) ──────────────────────────────
    prisma.lead.groupBy({
      by: ["temperature"],
      where: leadWhere(activeFilter),
      _count: { id: true },
    }),

    // ── Chart: source in period ───────────────────────────────────────────
    prisma.lead.groupBy({
      by: ["lead_source"],
      where: leadWhere(periodFilter),
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 8,
    }),

    // ── List: today follow-ups ────────────────────────────────────────────
    prisma.lead.findMany({
      where: leadWhere({ ...activeFilter, next_followup_date: { gte: todayStart, lte: todayEnd } }),
      select: {
        id: true, full_name: true, lead_number: true, phone: true,
        temperature: true, status: true, potential_lead_value: true,
        next_followup_date: true, followup_type: true,
        assigned_to: { select: { name: true } },
      },
      orderBy: { potential_lead_value: { sort: "desc", nulls: "last" } },
      take: 10,
    }),

    // ── List: overdue follow-ups ──────────────────────────────────────────
    prisma.lead.findMany({
      where: leadWhere({ ...activeFilter, next_followup_date: { lt: todayStart } }),
      select: {
        id: true, full_name: true, lead_number: true,
        temperature: true, status: true, potential_lead_value: true,
        next_followup_date: true, assigned_to: { select: { name: true } },
      },
      orderBy: { potential_lead_value: { sort: "desc", nulls: "last" } },
      take: 8,
    }),

    // ── Sales owner stats (all-time active) ───────────────────────────────
    prisma.lead.groupBy({
      by: ["assigned_to_id"],
      where: leadWhere(activeFilter),
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),

    // ── Leads per opportunity (all-time) ──────────────────────────────────
    prisma.leadOpportunity.groupBy({
      by: ["opportunity_id"],
      _count: { lead_id: true },
      orderBy: { _count: { lead_id: "desc" } },
      take: 8,
    }),

    // ── Insights: hot lead sources in period ──────────────────────────────
    prisma.lead.groupBy({
      by: ["lead_source"],
      where: leadWhere({ temperature: "Hot", ...periodFilter }),
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 1,
    }),

    // ── Won in period via stage history ───────────────────────────────────
    prisma.leadStageHistory.count({
      where: {
        to_stage: "Won",
        changed_at: { gte: rangeStart, lte: rangeEnd },
        lead: leadScope
          ? { deleted_at: null, ...leadScope }
          : { deleted_at: null },
      },
    }),
  ]);

  // ── Secondary: resolve names ────────────────────────────────────────────
  const ownerIds = (salesOwnerGroupBy as Array<{ assigned_to_id: string; _count: { id: number } }>)
    .map((r) => r.assigned_to_id).filter(Boolean);
  const ownerUsers = ownerIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })
    : [];
  const ownerNameMap = Object.fromEntries(ownerUsers.map((u) => [u.id, u.name]));
  const salesOwnerStats = (salesOwnerGroupBy as Array<{ assigned_to_id: string; _count: { id: number } }>)
    .map((r) => ({ id: r.assigned_to_id, name: ownerNameMap[r.assigned_to_id] ?? "Unknown", count: r._count.id }));

  const oppIds = (leadsPerOppRaw as Array<{ opportunity_id: string; _count: { lead_id: number } }>)
    .map((r) => r.opportunity_id).filter(Boolean);
  const oppRecords = oppIds.length > 0
    ? await prisma.opportunity.findMany({
        where: { id: { in: oppIds }, deleted_at: null },
        select: { id: true, name: true },
      })
    : [];
  const oppNameMap = Object.fromEntries(oppRecords.map((o) => [o.id, o.name]));
  const leadsPerOpportunity = (leadsPerOppRaw as Array<{ opportunity_id: string; _count: { lead_id: number } }>)
    .map((r) => ({ id: r.opportunity_id, name: oppNameMap[r.opportunity_id] ?? "Unknown", count: r._count.lead_id }))
    .filter((r) => r.name !== "Unknown");

  // ── Action queue ────────────────────────────────────────────────────────
  const TEMP_PRIO: Record<string, number> = { Hot: 0, Warm: 1, Cold: 2, FollowUpLater: 3 };
  const actionQueueLeads = await prisma.lead.findMany({
    where: leadWhereWithOr([
      { next_followup_date: { lte: todayEnd }, ...activeFilter },
      { stage_history: { none: { from_stage: { not: null } } }, followups: { none: {} } },
      { ...activeFilter, updated_at: { lt: subDays(todayStart, staleDays) } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ]) as any,
    select: {
      id: true, full_name: true, lead_number: true, phone: true,
      temperature: true, status: true,
      next_followup_date: true, updated_at: true, lead_source: true,
      assigned_to: { select: { id: true, name: true } },
      opportunities: {
        select: { opportunity: { select: { id: true, name: true } } },
        take: 1,
        orderBy: { tagged_at: "desc" },
      },
    },
    take: 50,
    orderBy: { updated_at: "asc" },
  }) as Array<{
    id: string; full_name: string; lead_number: string; phone: string | null;
    temperature: string | null; status: string;
    next_followup_date: Date | null; updated_at: Date; lead_source: string | null;
    assigned_to: { id: string; name: string };
    opportunities: Array<{ opportunity: { id: string; name: string } }>;
  }>;
  const sortedActionQueue = [...actionQueueLeads]
    .sort((a, b) => {
      const pa = TEMP_PRIO[a.temperature ?? "Cold"] ?? 3;
      const pb = TEMP_PRIO[b.temperature ?? "Cold"] ?? 3;
      if (pa !== pb) return pa - pb;
      const aOver = a.next_followup_date && new Date(a.next_followup_date) < todayStart;
      const bOver = b.next_followup_date && new Date(b.next_followup_date) < todayStart;
      if (aOver && !bOver) return -1;
      if (!aOver && bOver) return 1;
      return 0;
    })
    .slice(0, 25);

  // ── Smart insights ─────────────────────────────────────────────────────
  const notActioned = Math.max(0, leadsReceived - leadsActioned);
  const responseRate = leadsReceived > 0 ? Math.round((leadsActioned / leadsReceived) * 100) : 0;
  const topHotSource = (hotLeadsBySource as Array<{ lead_source: string | null; _count: { id: number } }>)[0];
  const insights: string[] = [];
  if (pendingFirstAction > 0)
    insights.push(`${pendingFirstAction} lead${pendingFirstAction > 1 ? "s" : ""} are waiting for first contact.`);
  if (topHotSource?.lead_source && topHotSource._count.id > 0)
    insights.push(`"${topHotSource.lead_source}" brought ${topHotSource._count.id} hot lead${topHotSource._count.id > 1 ? "s" : ""} ${rangeLabel.toLowerCase()}.`);
  if (overdueFollowUpsCount > 0)
    insights.push(`${overdueFollowUpsCount} overdue follow-up${overdueFollowUpsCount > 1 ? "s" : ""} need immediate attention.`);
  if (staleLeads > 0)
    insights.push(`${staleLeads} active lead${staleLeads > 1 ? "s" : ""} haven't had any update in ${staleDays}+ days.`);
  if (notActioned > 0 && leadsReceived > 0 && responseRate < 50)
    insights.push(`Response rate is ${responseRate}% — ${notActioned} lead${notActioned > 1 ? "s" : ""} received ${rangeLabel.toLowerCase()} haven't been worked on.`);
  if (warmLeads > hotLeads && warmLeads > 5)
    insights.push(`${warmLeads} warm leads are ready to be upgraded to hot.`);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Sales Dashboard</h1>
        <p className="text-sm text-muted-foreground">Pipeline health, period performance &amp; action queue</p>
      </div>

      <SalesDashboardClient
        agentName={session.user.name ?? "Agent"}
        currentPeriod={period}
        currentFrom={sp.from}
        currentTo={sp.to}
        staleDays={staleDays}
        rangeLabel={rangeLabel}
        periodKpis={{
          received: leadsReceived,
          actioned: leadsActioned,
          notActioned,
          responseRate,
          wonInPeriod,
        }}
        liveKpis={{
          hotLeads,
          warmLeads,
          coldLeads,
          pendingFirstAction,
          staleLeads,
          toActionToday,
          todayFollowUps: todayFollowUpsCount,
          overdueFollowUps: overdueFollowUpsCount,
          noActivityLeads,
        }}
        todayLeads={todayLeadsList.map((l) => ({
          id: l.id, full_name: l.full_name, lead_number: l.lead_number, phone: l.phone,
          temperature: l.temperature, status: l.status,
          potential_lead_value: l.potential_lead_value ? Number(l.potential_lead_value) : null,
          next_followup_date: l.next_followup_date?.toISOString() ?? null,
          followup_type: l.followup_type,
          assigned_to_name: l.assigned_to.name,
        }))}
        overdueLeads={overdueLeadsList.map((l) => ({
          id: l.id, full_name: l.full_name, lead_number: l.lead_number,
          temperature: l.temperature, status: l.status,
          potential_lead_value: l.potential_lead_value ? Number(l.potential_lead_value) : null,
          next_followup_date: l.next_followup_date?.toISOString() ?? null,
          days_overdue: l.next_followup_date
            ? Math.abs(differenceInCalendarDays(new Date(l.next_followup_date), todayStart))
            : 0,
          assigned_to_name: l.assigned_to.name,
        }))}
        stageDistribution={stageDistribution.map((s) => ({
          stage: s.status,
          count: s._count.id,
          value: Number(s._sum.potential_lead_value ?? 0),
        }))}
        temperatureDistribution={temperatureDistribution.map((t) => ({
          temp: t.temperature, count: t._count.id,
        }))}
        sourceDistribution={sourceDistribution.map((s) => ({
          source: s.lead_source, count: s._count.id,
        }))}
        salesOwnerStats={salesOwnerStats}
        leadsPerOpportunity={leadsPerOpportunity}
        actionQueue={sortedActionQueue.map((l) => ({
          id: l.id, full_name: l.full_name, lead_number: l.lead_number, phone: l.phone,
          temperature: l.temperature, status: l.status,
          activity_stage: null, lead_source: l.lead_source,
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
