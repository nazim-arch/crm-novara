import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { leadScopeFilter } from "@/lib/rbac";
import { startOfDay, endOfDay } from "date-fns";
import type { Prisma } from "@/lib/generated/prisma/client";
import { DashboardFilters } from "@/components/podcast-studio/DashboardFilters";
import { PipelineFilters } from "@/components/dashboard/PipelineFilters";
import { PipelineBoard, type PipelineColumn, type PipelineLead } from "@/components/dashboard/PipelineBoard";
import { resolveDateRange, type DashboardRange } from "@/lib/date-range";
import { Suspense } from "react";
import { unstable_cache } from "next/cache";

// Active pipeline stages only — terminal/parked stages (Won, Lost, InvalidLead, OnHold, Recycle)
// are intentionally excluded from this focus board.
const PIPELINE_STAGES = ["New", "Contacted", "Prospect", "SiteVisitCompleted", "Negotiation", "Booked"] as const;

const STAGE_LABELS: Record<string, string> = {
  New: "New",
  Contacted: "Contacted",
  Prospect: "Prospect",
  SiteVisitCompleted: "Site Visit",
  Negotiation: "Negotiation",
  Booked: "Booked",
};

const STAGE_OPTIONS = PIPELINE_STAGES.map((stage) => ({ stage, label: STAGE_LABELS[stage] }));

function todayIST() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type SearchParams = Promise<{
  range?: string;
  from?: string;
  to?: string;
  opportunity_id?: string;
  temperature?: string;
  hidden?: string;
}>;

// ── Skeleton ────────────────────────────────────────────────────────────────

function BoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4 animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex-1 min-w-[280px] space-y-2">
          <div className="h-6 w-32 rounded bg-muted" />
          {Array.from({ length: 3 }).map((_, j) => (
            <div key={j} className="h-24 rounded-lg bg-muted" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Cached data fetcher ───────────────────────────────────────────────────────

const getPipelineData = unstable_cache(
  async (
    userId: string,
    role: string,
    rangeEndISO: string,
    todayStartISO: string,
    todayEndISO: string,
    opportunityId: string | null,
    temperature: string | null,
  ) => {
    const rangeEnd = new Date(rangeEndISO);
    const todayStart = new Date(todayStartISO);
    const todayEnd = new Date(todayEndISO);

    const leadScope = leadScopeFilter(role, userId);

    const where: Prisma.LeadWhereInput = {
      deleted_at: null,
      status: { in: [...PIPELINE_STAGES] },
      ...(temperature && temperature !== "all"
        ? { temperature: temperature as Prisma.EnumLeadTemperatureFilter }
        : {}),
      ...(opportunityId ? { opportunities: { some: { opportunity_id: opportunityId } } } : {}),
      // Keep overdue + unscheduled leads visible; defer only leads scheduled after the range.
      // Nested in AND so it does not collide with the OR that leadScopeFilter may return.
      AND: [
        ...(leadScope ? [leadScope] : []),
        { OR: [{ next_followup_date: { lte: rangeEnd } }, { next_followup_date: null }] },
      ],
    };

    const rows = await prisma.lead.findMany({
      where,
      select: {
        id: true,
        full_name: true,
        lead_number: true,
        status: true,
        temperature: true,
        potential_lead_value: true,
        next_followup_date: true,
        updated_at: true,
        assigned_to: { select: { name: true } },
      },
    });

    // Compute urgency rank and bucket by stage.
    const buckets: Record<string, PipelineLead[]> = {};
    for (const stage of PIPELINE_STAGES) buckets[stage] = [];

    for (const l of rows) {
      const nfd = l.next_followup_date;
      let dueRank: number;
      if (!nfd) dueRank = 3;
      else if (nfd < todayStart) dueRank = 0;
      else if (nfd <= todayEnd) dueRank = 1;
      else dueRank = 2;

      buckets[l.status]?.push({
        id: l.id,
        full_name: l.full_name,
        lead_number: l.lead_number,
        temperature: l.temperature,
        potential_lead_value: l.potential_lead_value ? Number(l.potential_lead_value) : null,
        next_followup_date: nfd?.toISOString() ?? null,
        dueRank,
        assigned_to_name: l.assigned_to.name,
      });
    }

    // Sort each bucket: most urgent first; tie-break by follow-up date (soonest first),
    // no-follow-up leads by most recently updated.
    const updatedMap = new Map(rows.map((r) => [r.id, r.updated_at.getTime()]));
    for (const stage of PIPELINE_STAGES) {
      buckets[stage].sort((a, b) => {
        if (a.dueRank !== b.dueRank) return a.dueRank - b.dueRank;
        if (a.dueRank === 3) return (updatedMap.get(b.id) ?? 0) - (updatedMap.get(a.id) ?? 0);
        const at = a.next_followup_date ? new Date(a.next_followup_date).getTime() : 0;
        const bt = b.next_followup_date ? new Date(b.next_followup_date).getTime() : 0;
        return at - bt;
      });
    }

    const columns: PipelineColumn[] = PIPELINE_STAGES.map((stage) => {
      const leads = buckets[stage];
      return {
        stage,
        label: STAGE_LABELS[stage],
        count: leads.length,
        totalValue: leads.reduce((sum, l) => sum + (l.potential_lead_value ?? 0), 0),
        leads,
      };
    });

    return columns;
  },
  ["pipeline-board"],
  { tags: ["pipeline-board"], revalidate: 300 },
);

// ── Content (runs inside Suspense) ────────────────────────────────────────────

async function PipelineContent({
  userId,
  role,
  rangeEnd,
  todayStart,
  todayEnd,
  opportunityId,
  temperature,
  hidden,
}: {
  userId: string;
  role: string;
  rangeEnd: Date;
  todayStart: Date;
  todayEnd: Date;
  opportunityId: string | null;
  temperature: string | null;
  hidden: string[];
}) {
  const columns = await getPipelineData(
    userId,
    role,
    rangeEnd.toISOString(),
    todayStart.toISOString(),
    todayEnd.toISOString(),
    opportunityId,
    temperature,
  );

  const visible = columns.filter((c) => !hidden.includes(c.stage));
  return <PipelineBoard columns={visible} />;
}

// ── Page shell ────────────────────────────────────────────────────────────────

export default async function PipelineBoardPage({ searchParams }: { searchParams: SearchParams }) {
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
  const rangeEnd = new Date(end + "T23:59:59");
  void start;

  const opportunityId = sp.opportunity_id ?? null;
  const temperature = sp.temperature ?? null;
  const hidden = sp.hidden ? sp.hidden.split(",").filter(Boolean) : [];

  const opportunities = await prisma.opportunity.findMany({
    where: { deleted_at: null },
    select: { id: true, name: true, opp_number: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-3 sm:p-6 space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Pipeline Board</h1>
        <p className="text-sm text-muted-foreground">Leads by stage, most urgent first</p>
      </div>

      <Suspense>
        <DashboardFilters
          currentRange={range}
          currentFrom={sp.from}
          currentTo={sp.to}
          rangeLabel={rangeLabel}
        />
      </Suspense>

      <PipelineFilters
        opportunities={opportunities}
        currentOpportunityId={opportunityId ?? undefined}
        currentTemperature={temperature ?? undefined}
        hidden={hidden}
        stages={STAGE_OPTIONS}
      />

      <Suspense fallback={<BoardSkeleton />}>
        <PipelineContent
          userId={session.user.id}
          role={session.user.role}
          rangeEnd={rangeEnd}
          todayStart={todayStart}
          todayEnd={todayEnd}
          opportunityId={opportunityId}
          temperature={temperature}
          hidden={hidden}
        />
      </Suspense>
    </div>
  );
}
