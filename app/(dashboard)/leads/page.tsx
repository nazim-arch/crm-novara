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
import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth, startOfYear } from "date-fns";

const SORT_MAP: Record<string, Prisma.LeadOrderByWithRelationInput> = {
  full_name:            { full_name: "asc" },
  status:               { status: "asc" },
  temperature:          { temperature: "asc" },
  next_followup_date:   { next_followup_date: "asc" },
  potential_lead_value: { potential_lead_value: "asc" },
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
}>;

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  const sp = await searchParams;

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const staleDays = Math.max(1, Number(sp.stale_days ?? "7"));

  const page = Math.max(1, Number(sp.page ?? "1"));
  const limit = 20;
  const sortCol = sp.sort ?? "updated_at";
  const sortDir = sp.dir === "asc" ? "asc" : "desc";

  const where: Prisma.LeadWhereInput = {
    deleted_at: null,
    ...(sp.status && sp.status !== "all" && { status: sp.status as Prisma.EnumLeadStatusFilter }),
    ...(sp.temperature && sp.temperature !== "all" && { temperature: sp.temperature as Prisma.EnumLeadTemperatureFilter }),
    ...(sp.assigned_to && sp.assigned_to !== "all" && { assigned_to_id: sp.assigned_to }),
    ...(sp.search && {
      OR: [
        { full_name: { contains: sp.search, mode: "insensitive" } },
        { phone: { contains: sp.search } },
        { lead_number: { contains: sp.search, mode: "insensitive" } },
      ],
    }),
    ...(sp.source && { lead_source: sp.source }),
    ...(sp.opportunity_id && { opportunities: { some: { opportunity_id: sp.opportunity_id } } }),
  };

  // Role-based scope
  if (session?.user.role === "Sales") {
    where.AND = [
      {
        OR: [
          { assigned_to_id: session.user.id },
          { lead_owner_id: session.user.id },
          { created_by_id: session.user.id },
        ],
      },
    ];
  }

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
        temperature: true,
        property_type: true,
        next_followup_date: true,
        potential_lead_value: true,
        budget_min: true,
        budget_max: true,
        location_preference: true,
        assigned_to: { select: { id: true, name: true } },
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
    const qs = params.toString();
    return `/leads${qs ? `?${qs}` : ""}`;
  })();

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Leads</h1>
          <p className="text-sm text-muted-foreground">{total} total leads</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton href="/api/leads/export" filename="leads.xlsx" />
          <LeadImportModal />
          <LeadUpdateModal />
          <Button render={<Link href="/leads/new" />}>
            <Plus className="h-4 w-4 mr-1" />
            New Lead
          </Button>
        </div>
      </div>

      {/* Active special filter banner */}
      {activeFilterLabel && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-sm">
          <span className="font-medium text-primary">{activeFilterLabel}</span>
          <span className="text-muted-foreground">— showing {total} leads</span>
          <Link
            href={clearFilterUrl}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear filter
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
        }}
      />

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-32">Lead ID</TableHead>
              <TableHead>{sh("full_name", "Name")}</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>{sh("status", "Status")}</TableHead>
              <TableHead>{sh("temperature", "Temp")}</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Property Type</TableHead>
              <TableHead>{sh("next_followup_date", "Follow-up")}</TableHead>
              <TableHead className="text-right">{sh("potential_lead_value", "Pipeline Value", "ml-auto")}</TableHead>
              <TableHead className="w-24">Contact</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                  No leads found
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow key={lead.id} className="hover:bg-muted/30 cursor-pointer">
                  <TableCell>
                    <Link href={`/leads/${lead.id}`} className="font-mono text-xs text-primary hover:underline">
                      {lead.lead_number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                      {lead.full_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{lead.phone}</TableCell>
                  <TableCell><LeadStatusBadge status={lead.status} /></TableCell>
                  <TableCell><TemperatureBadge temperature={lead.temperature} /></TableCell>
                  <TableCell className="text-sm">{lead.assigned_to.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{lead.property_type ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.next_followup_date ? (
                      <span className={new Date(lead.next_followup_date) < new Date() ? "text-destructive font-medium" : ""}>
                        {formatDate(lead.next_followup_date)}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {lead.potential_lead_value ? formatCurrency(Number(lead.potential_lead_value)) : "—"}
                  </TableCell>
                  <TableCell>
                    <LeadContactActions
                      leadId={lead.id}
                      phone={lead.phone}
                      leadName={lead.full_name}
                      agentName={session?.user?.name ?? "Agent"}
                      propertyType={lead.property_type}
                      budgetMin={lead.budget_min ? Number(lead.budget_min) : null}
                      budgetMax={lead.budget_max ? Number(lead.budget_max) : null}
                      location={lead.location_preference}
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
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
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
