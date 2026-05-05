"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CalendarClock, UserPlus, Clock, Eye, RefreshCw, Zap, Search, X,
} from "lucide-react";
import { ActionCard } from "@/components/dashboard/ActionCard";
import { SECTION_META, type ActionItem, type ActionSection } from "@/lib/command-center-types";

// ── Types ─────────────────────────────────────────────────────────────────

type KpiFilter = "all" | "overdue" | "today" | "new_leads" | "stale" | "pending_first";

interface Props {
  actions: ActionItem[];
  agentName: string;
  userId: string;
  userRole: string;
}

// ── KPI Card ──────────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon: Icon, color, active, onClick,
}: {
  label: string; value: number; icon: React.ElementType;
  color: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-all hover:shadow-md ${
        active
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card hover:border-primary/40"
      }`}
    >
      <div className="flex items-center justify-between w-full">
        <span className="text-2xl font-bold" style={{ color: active ? undefined : color }}>
          {value}
        </span>
        <div
          className="p-1.5 rounded-lg"
          style={{ background: `${color}18`, color }}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-snug">{label}</p>
    </button>
  );
}

// ── Section header ────────────────────────────────────────────────────────

function SectionHeader({
  section, count,
}: {
  section: ActionSection; count: number;
}) {
  const meta = SECTION_META[section];
  const emoji: Record<ActionSection, string> = {
    urgent: "🔴", today: "🟡", pipeline: "🔵", upcoming: "⚫",
  };
  return (
    <div className="flex items-center gap-2 mb-3 mt-1">
      <span className="text-sm font-semibold" style={{ color: meta.color }}>
        {emoji[section]} {meta.label}
      </span>
      <span
        className="text-xs font-medium px-1.5 py-0.5 rounded-full"
        style={{ background: `${meta.color}18`, color: meta.color }}
      >
        {count}
      </span>
      <div className="flex-1 border-t border-border ml-2" />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-4xl mb-3">🎉</div>
      <p className="text-sm font-medium text-foreground">You&apos;re all caught up!</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        No actions in this category. Check back later or explore the Leads section.
      </p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

const SECTIONS: ActionSection[] = ["urgent", "today", "pipeline", "upcoming"];

export function CommandCenterClient({ actions: initialActions, agentName }: Props) {
  const router = useRouter();
  const [actions, setActions] = useState<ActionItem[]>(initialActions);
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>("all");
  const [sectionFilter, setSectionFilter] = useState<ActionSection | "all">("all");
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  // ── KPI counts ────────────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    overdue:       actions.filter((a) => a.overdueDays > 0).length,
    today:         actions.filter((a) => a.section === "today" || a.section === "urgent").length,
    new_leads:     actions.filter((a) => a.reason.includes("New lead today")).length,
    stale:         actions.filter((a) => a.reason.includes("Stale")).length,
    pending_first: actions.filter((a) => a.reason.includes("first contact")).length,
  }), [actions]);

  // ── Filtered + grouped actions ────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = actions;

    // KPI filter overrides section filter
    if (kpiFilter !== "all") {
      if (kpiFilter === "overdue")       list = list.filter((a) => a.overdueDays > 0);
      if (kpiFilter === "today")         list = list.filter((a) => a.section === "today" || a.section === "urgent");
      if (kpiFilter === "new_leads")     list = list.filter((a) => a.reason.includes("New lead today"));
      if (kpiFilter === "stale")         list = list.filter((a) => a.reason.includes("Stale"));
      if (kpiFilter === "pending_first") list = list.filter((a) => a.reason.includes("first contact"));
    } else if (sectionFilter !== "all") {
      list = list.filter((a) => a.section === sectionFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) =>
        a.lead?.full_name?.toLowerCase().includes(q) ||
        a.lead?.lead_number?.toLowerCase().includes(q) ||
        a.lead?.phone?.toLowerCase().includes(q) ||
        a.opportunity?.name?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [actions, kpiFilter, sectionFilter, search]);

  const grouped = useMemo(
    () =>
      SECTIONS.reduce<Record<ActionSection, ActionItem[]>>(
        (acc, s) => {
          acc[s] = filtered.filter((a) => a.section === s);
          return acc;
        },
        { urgent: [], today: [], pipeline: [], upcoming: [] }
      ),
    [filtered]
  );

  function removeAction(id: string) {
    setActions((prev) => prev.filter((a) => a.id !== id));
  }

  function handleKpi(key: KpiFilter) {
    setKpiFilter((cur) => (cur === key ? "all" : key));
    setSectionFilter("all");
  }

  function handleSection(s: ActionSection | "all") {
    setSectionFilter(s);
    setKpiFilter("all");
  }

  async function refresh() {
    setRefreshing(true);
    router.refresh();
    // Reset local removals by re-reading the route data
    setTimeout(() => setRefreshing(false), 800);
  }

  const totalVisible = filtered.length;
  const sectionCounts = useMemo(
    () => SECTIONS.reduce<Record<string, number>>((acc, s) => {
      acc[s] = actions.filter((a) => a.section === s).length;
      return acc;
    }, {}),
    [actions]
  );

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div className="min-h-full bg-muted/30">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-bold">Sales Command Center</h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {today} · {actions.length} action{actions.length !== 1 ? "s" : ""} pending
            </p>
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs text-muted-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* ── Search bar ──────────────────────────────────────────── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, lead number, phone, or opportunity…"
            className="w-full rounded-xl border border-border bg-card pl-9 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ── KPI Cards ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <KpiCard label="Overdue Actions"    value={kpis.overdue}       icon={AlertTriangle} color="#ef4444" active={kpiFilter === "overdue"}       onClick={() => handleKpi("overdue")} />
          <KpiCard label="Today's Actions"    value={kpis.today}         icon={CalendarClock} color="#f59e0b" active={kpiFilter === "today"}         onClick={() => handleKpi("today")} />
          <KpiCard label="New Leads Today"    value={kpis.new_leads}     icon={UserPlus}      color="#3b82f6" active={kpiFilter === "new_leads"}     onClick={() => handleKpi("new_leads")} />
          <KpiCard label="Stale Leads"        value={kpis.stale}         icon={Clock}         color="#8b5cf6" active={kpiFilter === "stale"}         onClick={() => handleKpi("stale")} />
          <KpiCard label="Pending 1st Contact" value={kpis.pending_first} icon={Eye}           color="#ec4899" active={kpiFilter === "pending_first"} onClick={() => handleKpi("pending_first")} />
        </div>

        {/* ── Section filter pills ─────────────────────────────────── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
          {(["all", ...SECTIONS] as const).map((s) => {
            const active = kpiFilter === "all" && sectionFilter === s;
            const count = s === "all" ? actions.length : sectionCounts[s] ?? 0;
            const color = s === "all" ? undefined : SECTION_META[s].color;
            const label = s === "all" ? "All" : SECTION_META[s].label;
            return (
              <button
                key={s}
                onClick={() => handleSection(s as ActionSection | "all")}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
                style={active ? {} : color ? { borderColor: `${color}40` } : {}}
              >
                {s !== "all" && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: color ?? "currentColor" }}
                  />
                )}
                {label}
                <span
                  className={`ml-0.5 px-1 rounded-full text-[10px] font-semibold ${
                    active ? "bg-primary-foreground/20" : "bg-muted"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Active filter label ──────────────────────────────────── */}
        {kpiFilter !== "all" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Filtered:</span>
            <span className="font-medium text-foreground">
              {kpiFilter === "overdue" && "Overdue Actions"}
              {kpiFilter === "today" && "Today's Actions"}
              {kpiFilter === "new_leads" && "New Leads Today"}
              {kpiFilter === "stale" && "Stale Leads"}
              {kpiFilter === "pending_first" && "Pending First Contact"}
            </span>
            <span>·</span>
            <span>{totalVisible} result{totalVisible !== 1 ? "s" : ""}</span>
            <button
              onClick={() => setKpiFilter("all")}
              className="ml-auto text-xs text-primary hover:underline"
            >
              Clear filter
            </button>
          </div>
        )}

        {/* ── Action cards ─────────────────────────────────────────── */}
        {totalVisible === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-6">
            {SECTIONS.map((section) => {
              const sectionItems = grouped[section];
              if (sectionItems.length === 0) return null;
              return (
                <section key={section}>
                  {(sectionFilter === "all" && kpiFilter === "all") && (
                    <SectionHeader section={section} count={sectionItems.length} />
                  )}
                  <div className="space-y-3">
                    {sectionItems.map((action) => (
                      <ActionCard
                        key={action.id}
                        action={action}
                        agentName={agentName}
                        onRemove={removeAction}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* ── Bottom spacer (mobile nav clearance) ───────────────── */}
        <div className="h-6" />
      </div>
    </div>
  );
}
