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
import { ExportButton } from "@/components/shared/ExportButton";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { startOfDay, endOfDay, subDays } from "date-fns";

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
  pending_action:   "Pending First Action",
  no_activity:      "Leads With No Activity",
  stale:            "Stale Leads",
  overdue_followup: "Overdue Follow-ups",
  to_action_today:  "To Action Today",
  actioned:         "Actioned Leads",
};

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

  // Special filter logic
  if (sp.filter === "today") {
    where.created_at = { gte: todayStart, lte: todayEnd };
  } else if (sp.filter === "pending_action") {
    where.status = "New";
    where.stage_history = { none: {} };
    where.followups = { none: {} };
  } else if (sp.filter === "no_activity") {
    where.stage_history = { none: {} };
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
    where.OR = [
      { stage_history: { some: {} } },
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
      include: { assigned_to: { select: { id: true, name: true } } },
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

  const activeFilterLabel = sp.filter
    ? sp.filter === "stale"
      ? `Stale Leads (${staleDays}+ days inactive)`
      : FILTER_LABELS[sp.filter]
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
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
