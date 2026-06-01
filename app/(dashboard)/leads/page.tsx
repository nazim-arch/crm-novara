import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LeadStatusBadge, TemperatureBadge } from "@/components/shared/LeadStatusBadge";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, X } from "lucide-react";
import type { Prisma } from "@/lib/generated/prisma/client";
import { LeadFilters } from "@/components/leads/LeadFilters";
import { LeadImportModal } from "@/components/leads/LeadImportModal";
import { LeadUpdateModal } from "@/components/leads/LeadUpdateModal";
import { ExportButton } from "@/components/shared/ExportButton";
import { LeadContactActions } from "@/components/shared/LeadContactActions";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { hasPermissionAsync, leadScopeFilter } from "@/lib/rbac";
import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth, startOfYear } from "date-fns";

const SORT_MAP: Record<string, Prisma.LeadOrderByWithRelationInput> = {
  full_name:            { full_name: "asc" },
  status:               { status: "asc" },
  temperature:          { temperature: "asc" },
  next_followup_date:   { next_followup_date: "asc" },
  potential_lead_value: { potential_lead_value: "asc" },
  assigned_to:          { assigned_to: { name: "asc" } },
  created_at:           { created_at: "asc" },
  updated_at:           { updated_at: "asc" },
};

const FILTER_LABELS: Record<string, string> = {
  today:            "Leads Received Today",
  period:           "Leads Received",
  pending_action:   "Pending First Action",
  no_activity:      "Leads With No Activity",
  stale:            "Stale Leads",
  overdue_followup: "Overdue Follow-ups",
  to_action_today:  "To Action Today",
  actioned:         "Actioned Leads",
  no_followup:      "No Follow-up Scheduled",
};

function resolvePeriodRange(
  period: string | undefined,
  from: string | undefined,
  to: string | undefined,
  today: Date,
): { gte: Date; lte: Date } | null {
  if (!period) return null;
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  switch (period) {
    case "today":      return { gte: todayStart, lte: todayEnd };
    case "yesterday": {
      const yd = subDays(todayStart, 1);
      return { gte: startOfDay(yd), lte: endOfDay(yd) };
    }
    case "this_week":  return { gte: startOfWeek(today, { weekStartsOn: 1 }), lte: todayEnd };
    case "this_month": return { gte: startOfMonth(today), lte: todayEnd };
    case "ytd":        return { gte: startOfYear(today), lte: todayEnd };
    case "custom":
      if (!from && !to) return null;
      return {
        gte: from ? new Date(from + "T00:00:00") : todayStart,
        lte: to   ? new Date(to   + "T23:59:59") : todayEnd,
      };
    default: return null;
  }
}

type SearchParams = Promise<{
  status?: string;
  temperature?: string;
  assigned_to?: string;
  search?: string;
  page?: string;
  sort?: string;
  dir?: string;
  filter?: string;
  stale_days?: string;
  source?: string;
  opportunity_id?: string;
  period?: string;
  from?: string;
  to?: string;
  activity_stage?: string;
}>;

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user) return null;
  const sp = await searchParams;
  const canImport = await hasPermissionAsync(session.user.role, "lead:import");
  const canExport = await hasPermissionAsync(session.user.role, "lead:export");

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const staleDays = Math.max(1, Number(sp.stale_days ?? "7"));

  const page = Math.max(1, Number(sp.page ?? "1"));
  const limit = 20;
  const sortCol = sp.sort ?? "updated_at";
  const sortDir = sp.dir === "asc" ? "asc" : "desc";

  // Role scope — must be resolved before building where
  const scope = leadScopeFilter(session.user.role, session.user.id);

  // Use AND array so multiple OR-based filters don't overwrite each other
  const andConditions: Prisma.LeadWhereInput[] = [];

  if (sp.status && sp.status !== "all") {
    andConditions.push({
      OR: [
        { opportunities: { some: { status: sp.status as Prisma.EnumLeadStatusFilter } } },
        { AND: [{ opportunities: { none: {} } }, { status: sp.status as Prisma.EnumLeadStatusFilter }] },
      ],
    });
  }

  if (sp.search) {
    andConditions.push({
      OR: [
        { full_name: { contains: sp.search.slice(0, 100), mode: "insensitive" } },
        { phone: { contains: sp.search.slice(0, 100) } },
        { lead_number: { contains: sp.search.slice(0, 100), mode: "insensitive" } },
      ],
    });
  }

  if (sp.activity_stage && sp.activity_stage !== "all") {
    andConditions.push({
      OR: [
        { opportunities: { some: { activity_stage: sp.activity_stage as Prisma.EnumActivityStageFilter } } },
        { AND: [{ opportunities: { none: {} } }, { activity_stage: sp.activity_stage as Prisma.EnumActivityStageFilter }] },
      ],
    });
  }

  if (scope) andConditions.push(scope);

  const where: Prisma.LeadWhereInput = {
    deleted_at: null,
    ...(sp.temperature && sp.temperature !== "all" && { temperature: sp.temperature as Prisma.EnumLeadTemperatureFilter }),
    ...(sp.assigned_to && sp.assigned_to !== "all" && { assigned_to_id: sp.assigned_to }),
    ...(sp.source && { lead_source: sp.source }),
    ...(sp.opportunity_id && { opportunities: { some: { opportunity_id: sp.opportunity_id } } }),
    ...(andConditions.length > 0 && { AND: andConditions }),
  };

  const periodRange = resolvePeriodRange(sp.period, sp.from, sp.to, today);

  // Special filter logic
  if (sp.filter === "today") {
    where.created_at = { gte: todayStart, lte: todayEnd };
  } else if (sp.filter === "period") {
    if (periodRange) where.created_at = periodRange;
  } else if (sp.filter === "pending_action") {
    if (periodRange) where.created_at = periodRange;
    where.stage_history = { none: { from_stage: { not: null } } };
    where.followups = { none: {} };
  } else if (sp.filter === "no_activity") {
    where.stage_history = { none: { from_stage: { not: null } } };
    where.followups = { none: {} };
  } else if (sp.filter === "stale") {
    where.updated_at = { lt: subDays(todayStart, staleDays) };
    where.status = { notIn: ["Won", "Lost", "InvalidLead", "Recycle"] };
  } else if (sp.filter === "overdue_followup") {
    where.next_followup_date = { lt: todayStart };
    where.status = { notIn: ["Won", "Lost", "InvalidLead", "Recycle"] };
  } else if (sp.filter === "to_action_today") {
    where.status = { notIn: ["Won", "Lost", "InvalidLead", "Recycle"] };
    where.next_followup_date = { lte: todayEnd };
  } else if (sp.filter === "actioned") {
    if (periodRange) where.created_at = periodRange;
    where.OR = [
      { stage_history: { some: { from_stage: { not: null } } } },
      { followups: { some: {} } },
    ];
  } else if (sp.filter === "no_followup") {
    where.next_followup_date = null;
    where.status = { notIn: ["Won", "Lost", "InvalidLead", "Recycle"] };
  }

  const baseOrder = SORT_MAP[sortCol] ?? { updated_at: "asc" };
  const orderBy = Object.fromEntries(
    Object.entries(baseOrder).map(([k]) => [k, sortDir])
  ) as Prisma.LeadOrderByWithRelationInput;

  const [total, leads, users] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      select: {
        id: true,
        lead_number: true,
        full_name: true,
        phone: true,
        status: true,
        activity_stage: true,
        temperature: true,
        property_type: true,
        next_followup_date: true,
        potential_lead_value: true,
        budget_min: true,
        budget_max: true,
        location_preference: true,
        assigned_to: { select: { id: true, name: true } },
        _count: { select: { followups: true } },
        opportunities: {
          select: {
            id: true,
            status: true,
            activity_stage: true,
            potential_lead_value: true,
            opportunity: { select: { id: true, opp_number: true, name: true } },
          },
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.findMany({
      where: { is_active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Expand into one row per opportunity link; unlinked leads produce one row using lead-level data
  const rows = leads.flatMap((lead) => {
    if (lead.opportunities.length === 0) {
      return [{
        ...lead,
        row_key: lead.id,
        link_id: null as string | null,
        link_status: lead.status as string,
        link_potential_value: lead.potential_lead_value,
        opportunity: null as { id: string; opp_number: string; name: string } | null,
        followup_count: lead._count.followups,
      }];
    }
    return lead.opportunities.map((lo) => ({
      ...lead,
      row_key: lo.id,
      link_id: lo.id as string | null,
      link_status: lo.status as string,
      link_potential_value: lo.potential_lead_value,
      opportunity: lo.opportunity as { id: string; opp_number: string; name: string } | null,
      followup_count: lead._count.followups,
    }));
  });

  const totalPages = Math.ceil(total / limit);
  const sh = (col: string, label: string, className?: string) => (
    <SortableHeader column={col} label={label} currentSort={sortCol} currentDir={sortDir} className={className} />
  );

  const PERIOD_LABEL: Record<string, string> = {
    today: "Today", yesterday: "Yesterday", this_week: "This Week",
    this_month: "This Month", ytd: "YTD", custom: "Custom Range",
  };
  const periodSuffix = sp.period && sp.period !== "custom" ? ` — ${PERIOD_LABEL[sp.period] ?? sp.period}` : "";
  const activeFilterLabel = sp.filter
    ? sp.filter === "stale"
      ? `Stale Leads (${staleDays}+ days inactive)`
      : (FILTER_LABELS[sp.filter] ?? sp.filter) + (["actioned", "pending_action", "period"].includes(sp.filter) ? periodSuffix : "")
    : sp.source
    ? `Source: ${sp.source}`
    : null;

  // Clear-filter URL (removes special params but keeps standard ones)
  const clearFilterUrl = (() => {
    const params = new URLSearchParams();
    if (sp.status && sp.status !== "all") params.set("status", sp.status);
    if (sp.temperature && sp.temperature !== "all") params.set("temperature", sp.temperature);
    if (sp.assigned_to && sp.assigned_to !== "all") params.set("assigned_to", sp.assigned_to);
    if (sp.search) params.set("search", sp.search);
    if (sp.activity_stage && sp.activity_stage !== "all") params.set("activity_stage", sp.activity_stage);
    const qs = params.toString();
    return `/leads${qs ? `?${qs}` : ""}`;
  })();

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold">Leads</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">{total} leads</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {canExport && <ExportButton href="/api/leads/export" filename="leads.xlsx" />}
          {canImport && <LeadImportModal />}
          {canImport && <LeadUpdateModal />}
          <Button render={<Link href="/leads/new" />} size="sm">
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">New Lead</span>
          </Button>
        </div>
      </div>

      {/* Active special filter banner */}
      {activeFilterLabel && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-xs sm:text-sm">
          <span className="font-medium text-primary truncate">{activeFilterLabel}</span>
          <span className="text-muted-foreground hidden sm:inline">— showing {total} leads</span>
          <Link
            href={clearFilterUrl}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Link>
        </div>
      )}

      {/* Filters */}
      <LeadFilters
        users={users}
        currentParams={{
          status: sp.status,
          temperature: sp.temperature,
          assigned_to: sp.assigned_to,
          search: sp.search,
          filter: sp.filter,
          source: sp.source,
          activity_stage: sp.activity_stage,
        }}
      />

      {/* Mobile card view */}
      <div className="md:hidden space-y-2">
        {rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No leads found</div>
        ) : (
          rows.map((row) => (
            <div key={row.row_key} className="rounded-xl border bg-card p-3 space-y-2.5 shadow-sm">
              {/* Row 1: name + badges */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/leads/${row.id}`} className="font-semibold text-sm hover:underline leading-tight block truncate">
                    {row.full_name}
                  </Link>
                  <span className="text-[11px] text-muted-foreground font-mono">{row.lead_number}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <TemperatureBadge temperature={row.temperature} />
                </div>
              </div>
              {/* Row 2: status + opportunity + property */}
              <div className="flex items-center gap-2 flex-wrap">
                <LeadStatusBadge status={row.link_status} />
                {row.opportunity && (
                  <Link href={`/opportunities/${row.opportunity.id}`} className="text-[11px] text-primary bg-primary/10 px-1.5 py-0.5 rounded hover:bg-primary/20 truncate max-w-[140px]">
                    {row.opportunity.name}
                  </Link>
                )}
                {row.property_type && (
                  <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {row.property_type}
                  </span>
                )}
                {row.assigned_to && (
                  <span className="text-[11px] text-muted-foreground">{row.assigned_to.name}</span>
                )}
              </div>
              {/* Row 3: follow-up date + count */}
              <div className="text-xs text-muted-foreground">
                {row.next_followup_date ? (
                  <>
                    Follow-up:{" "}
                    <span className={new Date(row.next_followup_date) < new Date() ? "text-destructive font-medium" : "font-medium"}>
                      {formatDate(row.next_followup_date)}
                    </span>
                    {row.followup_count > 0 && (
                      <span className="ml-1 text-muted-foreground">({row.followup_count} total)</span>
                    )}
                  </>
                ) : row.followup_count > 0 ? (
                  <span>{row.followup_count} follow-up{row.followup_count !== 1 ? "s" : ""} · no next date</span>
                ) : (
                  <span className="text-amber-500 font-medium">No follow-up</span>
                )}
              </div>
              {/* Row 4: actions */}
              <div className="flex items-center gap-2 pt-0.5">
                <LeadContactActions
                  leadId={row.id}
                  phone={row.phone}
                  leadName={row.full_name}
                  agentName={session?.user?.name ?? "Agent"}
                  propertyType={row.property_type}
                  budgetMin={row.budget_min ? Number(row.budget_min) : null}
                  budgetMax={row.budget_max ? Number(row.budget_max) : null}
                  location={row.location_preference}
                  variant="compact"
                />
                <Link
                  href={`/leads/${row.id}`}
                  className="ml-auto text-xs text-primary hover:underline font-medium"
                >
                  View →
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-32">Lead ID</TableHead>
              <TableHead>{sh("full_name", "Name")}</TableHead>
              <TableHead>Opportunity</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>{sh("status", "Status")}</TableHead>
              <TableHead>{sh("temperature", "Temp")}</TableHead>
              <TableHead>{sh("assigned_to", "Assigned To")}</TableHead>
              <TableHead>Property Type</TableHead>
              <TableHead>{sh("next_followup_date", "Follow-up")}</TableHead>
              <TableHead className="text-right">{sh("potential_lead_value", "Pipeline Value", "ml-auto")}</TableHead>
              <TableHead className="w-24">Contact</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                  No leads found
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.row_key} className="hover:bg-muted/30 cursor-pointer">
                  <TableCell>
                    <Link href={`/leads/${row.id}`} className="font-mono text-xs text-primary hover:underline">
                      {row.lead_number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/leads/${row.id}`} className="font-medium hover:underline">
                      {row.full_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.opportunity ? (
                      <Link href={`/opportunities/${row.opportunity.id}`} className="text-primary hover:underline text-xs">
                        {row.opportunity.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.phone}</TableCell>
                  <TableCell><LeadStatusBadge status={row.link_status} /></TableCell>
                  <TableCell><TemperatureBadge temperature={row.temperature} /></TableCell>
                  <TableCell className="text-sm">{row.assigned_to.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.property_type ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {row.next_followup_date ? (
                      <div>
                        <span className={new Date(row.next_followup_date) < new Date() ? "text-destructive font-medium" : ""}>
                          {formatDate(row.next_followup_date)}
                        </span>
                        {row.followup_count > 0 && (
                          <span className="block text-[11px] text-muted-foreground">({row.followup_count} total)</span>
                        )}
                      </div>
                    ) : row.followup_count > 0 ? (
                      <div>
                        <span className="text-muted-foreground">—</span>
                        <span className="block text-[11px] text-muted-foreground">{row.followup_count} total</span>
                      </div>
                    ) : (
                      <span className="text-amber-500 text-xs font-medium">No FU</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {row.link_potential_value ? formatCurrency(Number(row.link_potential_value)) : "—"}
                  </TableCell>
                  <TableCell>
                    <LeadContactActions
                      leadId={row.id}
                      phone={row.phone}
                      leadName={row.full_name}
                      agentName={session?.user?.name ?? "Agent"}
                      propertyType={row.property_type}
                      budgetMin={row.budget_min ? Number(row.budget_min) : null}
                      budgetMax={row.budget_max ? Number(row.budget_max) : null}
                      location={row.location_preference}
                      variant="compact"
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs sm:text-sm text-muted-foreground">
          <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} leads</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Button variant="outline" size="sm" render={<Link href={`/leads?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]), page: String(page - 1) })}`} />}>
                Previous
              </Button>
            )}
            {page < totalPages && (
              <Button variant="outline" size="sm" render={<Link href={`/leads?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]), page: String(page + 1) })}`} />}>
                Next
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
