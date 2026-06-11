import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LeadStatusBadge, TemperatureBadge, ActivityStageBadge } from "@/components/shared/LeadStatusBadge";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, X, CheckCircle2, AlertCircle, Users as UsersIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { ColumnPicker } from "@/components/shared/ColumnPicker";
import { getVisibleColumns, type ColumnDef } from "@/lib/column-prefs";
import type { Prisma, PropertyType } from "@/lib/generated/prisma/client";
import { LeadFilters } from "@/components/leads/LeadFilters";
import { LeadImportModal } from "@/components/leads/LeadImportModal";
import { LeadUpdateModal } from "@/components/leads/LeadUpdateModal";
import { ExportButton } from "@/components/shared/ExportButton";
import { LeadContactActions } from "@/components/shared/LeadContactActions";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { ColumnFilterHeader } from "@/components/shared/ColumnFilterHeader";
import { hasPermissionAsync, leadScopeFilter } from "@/lib/rbac";
import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth, startOfYear } from "date-fns";

const SORT_MAP: Record<string, Prisma.LeadOrderByWithRelationInput> = {
  full_name:            { full_name: "asc" },
  status:               { status: "asc" },
  temperature:          { temperature: "asc" },
  next_followup_date:   { next_followup_date: "asc" },
  last_contact_date:    { last_contact_date: "asc" },
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

const LEAD_STATUS_OPTIONS = [
  { label: "New", value: "New" },
  { label: "Contacted", value: "Contacted" },
  { label: "Prospect", value: "Prospect" },
  { label: "Site Visit Done", value: "SiteVisitCompleted" },
  { label: "Negotiation", value: "Negotiation" },
  { label: "Won", value: "Won" },
  { label: "Lost", value: "Lost" },
  { label: "Invalid", value: "InvalidLead" },
  { label: "On Hold", value: "OnHold" },
  { label: "Recycle", value: "Recycle" },
];

const TEMPERATURE_OPTIONS = [
  { label: "Hot", value: "Hot" },
  { label: "Warm", value: "Warm" },
  { label: "Cold", value: "Cold" },
  { label: "Follow Up Later", value: "FollowUpLater" },
];

const PROPERTY_TYPE_OPTIONS = [
  { label: "Residential", value: "Residential" },
  { label: "Commercial", value: "Commercial" },
  { label: "Plot", value: "Plot" },
  { label: "Villa", value: "Villa" },
  { label: "Apartment", value: "Apartment" },
  { label: "Office", value: "Office" },
  { label: "Land", value: "Land" },
];

const PROFILE_OPTIONS = [
  { label: "Complete", value: "complete" },
  { label: "Incomplete", value: "incomplete" },
];

// Columns marked defaultHidden are available in the picker but off by default,
// so existing layouts are preserved while every useful field is selectable.
const LEAD_COLUMNS: ColumnDef[] = [
  { id: "lead_number", label: "Lead ID" },
  { id: "name", label: "Name", locked: true },
  { id: "profile", label: "Profile" },
  { id: "opportunity", label: "Opportunity" },
  { id: "phone", label: "Phone" },
  { id: "email", label: "Email", defaultHidden: true },
  { id: "whatsapp", label: "WhatsApp", defaultHidden: true },
  { id: "status", label: "Status" },
  { id: "activity_stage", label: "Activity Stage", defaultHidden: true },
  { id: "temperature", label: "Temperature" },
  { id: "lead_type", label: "Lead Type", defaultHidden: true },
  { id: "lead_source", label: "Lead Source", defaultHidden: true },
  { id: "assigned_to", label: "Assigned To" },
  { id: "lead_owner", label: "Lead Owner", defaultHidden: true },
  { id: "created_by", label: "Created By", defaultHidden: true },
  { id: "property_type", label: "Property Type" },
  { id: "unit_type", label: "Unit Type", defaultHidden: true },
  { id: "city", label: "City", defaultHidden: true },
  { id: "location_preference", label: "Location Preference", defaultHidden: true },
  { id: "budget", label: "Budget", defaultHidden: true },
  { id: "timeline_to_buy", label: "Timeline to Buy", defaultHidden: true },
  { id: "purpose", label: "Purpose", defaultHidden: true },
  { id: "closing_probability", label: "Closing %", defaultHidden: true },
  { id: "followup", label: "Follow-up" },
  { id: "followup_type", label: "Follow-up Type", defaultHidden: true },
  { id: "first_contact_date", label: "First Contact", defaultHidden: true },
  { id: "last_contact", label: "Last Contact" },
  { id: "value", label: "Pipeline Value" },
  { id: "deal_value", label: "Deal Value", defaultHidden: true },
  { id: "commission_estimate", label: "Commission Est.", defaultHidden: true },
  { id: "settlement_value", label: "Settlement Value", defaultHidden: true },
  { id: "financing_required", label: "Financing Required", defaultHidden: true },
  { id: "created_at", label: "Created Date", defaultHidden: true },
  { id: "updated_at", label: "Last Updated", defaultHidden: true },
  { id: "contact", label: "Contact" },
];

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
  property_type?: string;
  profile?: string;
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
  const staleContactCutoff = subDays(today, 7); // last-contact older than this is flagged
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

  if (sp.property_type && sp.property_type !== "all") {
    andConditions.push({ property_type: sp.property_type as PropertyType });
  }

  if (sp.profile === "complete") {
    andConditions.push({
      full_name: { not: "" },
      phone: { not: "" },
      lead_source: { not: "" },
      potential_lead_value: { not: null },
      opportunities: { some: {} },
    });
  } else if (sp.profile === "incomplete") {
    andConditions.push({
      OR: [
        { full_name: "" },
        { phone: "" },
        { lead_source: "" },
        { potential_lead_value: null },
        { opportunities: { none: {} } },
      ],
    });
  }

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

  const [total, leads, users, leadSourceRows] = await Promise.all([
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
        last_contact_date: true,
        potential_lead_value: true,
        lead_source: true,
        budget_min: true,
        budget_max: true,
        location_preference: true,
        email: true,
        whatsapp: true,
        lead_type: true,
        unit_type: true,
        city: true,
        timeline_to_buy: true,
        purpose: true,
        closing_probability: true,
        followup_type: true,
        first_contact_date: true,
        deal_value: true,
        commission_estimate: true,
        settlement_value: true,
        financing_required: true,
        created_at: true,
        updated_at: true,
        assigned_to: { select: { id: true, name: true } },
        lead_owner: { select: { id: true, name: true } },
        created_by: { select: { id: true, name: true } },
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
    prisma.lead.findMany({
      where: { deleted_at: null, lead_source: { not: "" } },
      select: { lead_source: true },
      distinct: ["lead_source"],
      orderBy: { lead_source: "asc" },
    }),
  ]);

  // Expand into one row per opportunity link; unlinked leads produce one row using lead-level data
  const rows = leads.flatMap((lead) => {
    const is_complete = !!(
      lead.full_name &&
      lead.phone &&
      lead.lead_source &&
      lead.temperature &&
      lead.potential_lead_value != null &&
      lead.opportunities.length > 0
    );

    if (lead.opportunities.length === 0) {
      return [{
        ...lead,
        is_complete,
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
      is_complete,
      row_key: lo.id,
      link_id: lo.id as string | null,
      link_status: lo.status as string,
      link_potential_value: lo.potential_lead_value,
      opportunity: lo.opportunity as { id: string; opp_number: string; name: string } | null,
      followup_count: lead._count.followups,
    }));
  });

  const v = await getVisibleColumns(session.user.id, "leads", LEAD_COLUMNS);
  const visibleLeadCols = LEAD_COLUMNS.filter((c) => v.has(c.id));
  const visibleCount = visibleLeadCols.length;

  const totalPages = Math.ceil(total / limit);
  const sh = (col: string, label: string, className?: string) => (
    <SortableHeader column={col} label={label} currentSort={sortCol} currentDir={sortDir} className={className} />
  );

  type LeadRow = (typeof rows)[number];
  const fmtMoney = (val: unknown) => (val != null ? formatCurrency(Number(val)) : "—");
  const fmtBudget = (min: unknown, max: unknown) => {
    if (min == null && max == null) return "—";
    if (min != null && max != null) return `${formatCurrency(Number(min))} – ${formatCurrency(Number(max))}`;
    return formatCurrency(Number(min ?? max));
  };

  // Per-column width / alignment for the desktop table
  const LEAD_HEAD_CLASS: Record<string, string> = {
    lead_number: "w-32",
    profile: "w-28",
    contact: "w-24",
    value: "text-right",
    deal_value: "text-right",
    commission_estimate: "text-right",
    settlement_value: "text-right",
    budget: "text-right",
    closing_probability: "text-right",
  };

  const leadHead = (id: string): ReactNode => {
    switch (id) {
      case "name": return sh("full_name", "Name");
      case "profile":
        return <ColumnFilterHeader label="Profile" filterParam="profile" filterOptions={PROFILE_OPTIONS} currentFilter={sp.profile} />;
      case "status":
        return <ColumnFilterHeader column="status" label="Status" currentSort={sortCol} currentDir={sortDir} filterParam="status" filterOptions={LEAD_STATUS_OPTIONS} currentFilter={sp.status} />;
      case "temperature":
        return <ColumnFilterHeader column="temperature" label="Temp" currentSort={sortCol} currentDir={sortDir} filterParam="temperature" filterOptions={TEMPERATURE_OPTIONS} currentFilter={sp.temperature} />;
      case "assigned_to":
        return <ColumnFilterHeader column="assigned_to" label="Assigned To" currentSort={sortCol} currentDir={sortDir} filterParam="assigned_to" filterOptions={users.map((u) => ({ label: u.name, value: u.id }))} currentFilter={sp.assigned_to} />;
      case "property_type":
        return <ColumnFilterHeader label="Property Type" filterParam="property_type" filterOptions={PROPERTY_TYPE_OPTIONS} currentFilter={sp.property_type} />;
      case "followup": return sh("next_followup_date", "Follow-up");
      case "last_contact": return sh("last_contact_date", "Last Contact");
      case "value": return sh("potential_lead_value", "Pipeline Value", "ml-auto");
      case "created_at": return sh("created_at", "Created Date");
      case "updated_at": return sh("updated_at", "Last Updated");
      default: return LEAD_COLUMNS.find((c) => c.id === id)?.label ?? id;
    }
  };

  const dash = <span className="text-muted-foreground">—</span>;
  const leadCell = (id: string, row: LeadRow): ReactNode => {
    switch (id) {
      case "lead_number":
        return <Link href={`/leads/${row.id}`} className="font-mono text-xs text-primary hover:underline">{row.lead_number}</Link>;
      case "name":
        return <Link href={`/leads/${row.id}`} className="font-medium hover:underline">{row.full_name}</Link>;
      case "profile":
        return row.is_complete ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Complete</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-500"><AlertCircle className="h-3.5 w-3.5" /> Incomplete</span>
        );
      case "opportunity":
        return row.opportunity ? (
          <Link href={`/opportunities/${row.opportunity.id}`} className="text-primary hover:underline text-xs">{row.opportunity.name}</Link>
        ) : dash;
      case "phone": return row.phone;
      case "email": return row.email || dash;
      case "whatsapp": return row.whatsapp || dash;
      case "status": return <LeadStatusBadge status={row.link_status} />;
      case "activity_stage": return <ActivityStageBadge stage={row.activity_stage} />;
      case "temperature": return <TemperatureBadge temperature={row.temperature} />;
      case "lead_type": return row.lead_type ?? dash;
      case "lead_source": return row.lead_source || dash;
      case "assigned_to": return row.assigned_to.name;
      case "lead_owner": return row.lead_owner?.name ?? dash;
      case "created_by": return row.created_by?.name ?? dash;
      case "property_type": return row.property_type ?? dash;
      case "unit_type": return row.unit_type ?? dash;
      case "city": return row.city ?? dash;
      case "location_preference": return row.location_preference ?? dash;
      case "budget": return fmtBudget(row.budget_min, row.budget_max);
      case "timeline_to_buy": return row.timeline_to_buy ?? dash;
      case "purpose": return row.purpose ?? dash;
      case "closing_probability": return row.closing_probability != null ? `${row.closing_probability}%` : dash;
      case "followup":
        return row.next_followup_date ? (
          <div>
            <span className={new Date(row.next_followup_date) < new Date() ? "text-destructive font-medium" : ""}>{formatDate(row.next_followup_date)}</span>
            {row.followup_count > 0 && <span className="block text-[11px] text-muted-foreground">({row.followup_count} total)</span>}
          </div>
        ) : row.followup_count > 0 ? (
          <div><span className="text-muted-foreground">—</span><span className="block text-[11px] text-muted-foreground">{row.followup_count} total</span></div>
        ) : (
          <span className="text-amber-500 text-xs font-medium">No FU</span>
        );
      case "followup_type": return row.followup_type ?? dash;
      case "first_contact_date": return row.first_contact_date ? formatDate(row.first_contact_date) : dash;
      case "last_contact":
        return row.last_contact_date ? (
          <span className={new Date(row.last_contact_date) < staleContactCutoff ? "text-amber-500" : ""}>{formatDate(row.last_contact_date)}</span>
        ) : (
          <span className="text-muted-foreground/50">Never</span>
        );
      case "value": return row.link_potential_value ? formatCurrency(Number(row.link_potential_value)) : "—";
      case "deal_value": return fmtMoney(row.deal_value);
      case "commission_estimate": return fmtMoney(row.commission_estimate);
      case "settlement_value": return fmtMoney(row.settlement_value);
      case "financing_required": return row.financing_required == null ? dash : row.financing_required ? "Yes" : "No";
      case "created_at": return formatDate(row.created_at);
      case "updated_at": return formatDate(row.updated_at);
      case "contact":
        return (
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
        );
      default: return dash;
    }
  };

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
      <PageHeader
        title="Leads"
        description={`${total} leads`}
        actions={
          <>
            <ColumnPicker
              listKey="leads"
              columns={LEAD_COLUMNS}
              visible={[...v]}
              className="hidden md:inline-flex"
            />
            {canExport && <ExportButton href="/api/leads/export" filename="leads.xlsx" />}
            {canImport && <LeadImportModal />}
            {canImport && <LeadUpdateModal />}
            <Button render={<Link href="/leads/new" />} size="sm">
              <Plus className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">New Lead</span>
            </Button>
          </>
        }
      />

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
        leadSources={leadSourceRows.map((r) => r.lead_source)}
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
          <div className="rounded-xl border bg-card">
            <EmptyState
              icon={UsersIcon}
              title="No leads found"
              description="Try adjusting your filters, or add a new lead to get started."
              action={
                <Button render={<Link href="/leads/new" />} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" /> New Lead
                </Button>
              }
            />
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.row_key} className="rounded-xl border bg-card p-3 space-y-2.5 shadow-sm">
              {/* Row 1: name + badges */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/leads/${row.id}`} className="font-semibold text-sm hover:underline leading-tight block truncate">
                    {row.full_name}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground font-mono">{row.lead_number}</span>
                    {row.is_complete ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> Complete
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-500">
                        <AlertCircle className="h-3 w-3" /> Incomplete
                      </span>
                    )}
                  </div>
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
              {visibleLeadCols.map((col) => (
                <TableHead key={col.id} className={LEAD_HEAD_CLASS[col.id]}>
                  {leadHead(col.id)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleCount}>
                  <EmptyState
                    icon={UsersIcon}
                    title="No leads found"
                    description="Try adjusting your filters, or add a new lead to get started."
                    action={
                      <Button render={<Link href="/leads/new" />} size="sm" variant="outline">
                        <Plus className="h-4 w-4 mr-1" /> New Lead
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.row_key} className="hover:bg-muted/30 cursor-pointer">
                  {visibleLeadCols.map((col) => (
                    <TableCell
                      key={col.id}
                      className={LEAD_HEAD_CLASS[col.id]?.includes("text-right") ? "text-right text-sm" : "text-sm"}
                    >
                      {leadCell(col.id, row)}
                    </TableCell>
                  ))}
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
