"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users, Flame, CalendarClock, AlertTriangle,
  CheckCircle2, XCircle, Clock, Eye, PhoneCall, MessageSquare,
  Plus, Snowflake, Lightbulb, UserCheck, BarChart3, Zap, Thermometer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, Tooltip, Legend,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SalesKpis {
  totalLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  leadsToday: number;
  leadsActioned: number;
  pendingFirstAction: number;
  toActionToday: number;
  todayFollowUps: number;
  overdueFollowUps: number;
  noActivityLeads: number;
  staleLeads: number;
}

export interface ActionQueueLead {
  id: string; full_name: string; lead_number: string; phone: string | null;
  temperature: string | null; status: string; activity_stage: string | null;
  lead_source: string | null; next_followup_date: string | null; updated_at: string;
  assigned_to_name: string; assigned_to_id: string;
  opportunity_name: string | null; opportunity_id: string | null;
}

export interface TodayFocusLead {
  id: string; full_name: string; lead_number: string; phone: string | null;
  temperature: string | null; status: string;
  potential_lead_value: number | null; next_followup_date: string | null;
  followup_type: string | null; assigned_to_name: string;
}

export interface OverdueFocusLead {
  id: string; full_name: string; lead_number: string;
  temperature: string | null; status: string;
  potential_lead_value: number | null; next_followup_date: string | null;
  days_overdue: number; assigned_to_name: string;
}

export interface SalesOwnerRow { id: string; name: string; count: number }
export interface OppLeadRow { id: string; name: string; count: number }
export interface SourceRow { source: string | null; count: number }
export interface TempRow { temp: string | null; count: number }
export interface StageRow { stage: string; count: number }

interface Props {
  staleDays: number;
  kpis: SalesKpis;
  actionQueue: ActionQueueLead[];
  todayLeads: TodayFocusLead[];
  overdueLeads: OverdueFocusLead[];
  salesOwnerStats: SalesOwnerRow[];
  leadsPerOpportunity: OppLeadRow[];
  sourceDistribution: SourceRow[];
  temperatureDistribution: TempRow[];
  stageDistribution: StageRow[];
  insights: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fc(n: number) {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatShortDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

const TEMP_COLOR: Record<string, string> = {
  Hot: "#ef4444", Warm: "#f97316", Cold: "#3b82f6", FollowUpLater: "#a855f7",
};

const STAGE_LABELS: Record<string, string> = {
  New: "New", Prospect: "Prospect", SiteVisitCompleted: "Site Visit",
  Negotiation: "Negotiation", Won: "Won", Lost: "Lost",
  OnHold: "On Hold", Recycle: "Recycle", InvalidLead: "Invalid",
};
const STAGE_ORDER = ["New","Prospect","SiteVisitCompleted","Negotiation","Won","Lost","OnHold","Recycle","InvalidLead"];

const tooltipStyle = {
  fontSize: 12, borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  padding: "8px 12px",
};

// ── Sub-components ─────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon,
  iconClass = "text-muted-foreground", valueClass = "", href, urgent = false,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; iconClass?: string; valueClass?: string;
  href?: string; urgent?: boolean;
}) {
  const inner = (
    <CardContent className="pt-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground mb-1 truncate">{label}</p>
          <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg bg-muted/40 shrink-0 ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </CardContent>
  );

  if (href) {
    return (
      <Card className={`hover:shadow-md transition-shadow cursor-pointer ${urgent ? "border-destructive/30 bg-destructive/5" : ""}`}>
        <Link href={href} className="block">{inner}</Link>
      </Card>
    );
  }
  return <Card className={urgent ? "border-destructive/30 bg-destructive/5" : ""}>{inner}</Card>;
}

function TempBadge({ temp }: { temp: string | null }) {
  const map: Record<string, string> = {
    Hot: "bg-red-100 text-red-700 border-red-200",
    Warm: "bg-orange-100 text-orange-700 border-orange-200",
    Cold: "bg-blue-100 text-blue-700 border-blue-200",
    FollowUpLater: "bg-purple-100 text-purple-700 border-purple-200",
  };
  const icons: Record<string, string> = { Hot: "🔥", Warm: "☀️", Cold: "❄️", FollowUpLater: "🔔" };
  if (!temp) return null;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${map[temp] ?? "bg-muted text-muted-foreground"}`}>
      {icons[temp]} {temp}
    </span>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function SalesDashboardClient({
  staleDays, kpis, actionQueue, todayLeads, overdueLeads,
  salesOwnerStats, leadsPerOpportunity, sourceDistribution,
  temperatureDistribution, stageDistribution, insights,
}: Props) {
  const router = useRouter();
  const [activePieIndex, setActivePieIndex] = useState<number | undefined>(undefined);

  const sortedFunnel = [...stageDistribution]
    .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage))
    .filter((s) => s.count > 0);

  const tempData = temperatureDistribution.map((t) => ({
    name: t.temp ?? "Unknown", value: t.count,
    color: TEMP_COLOR[t.temp ?? ""] ?? "#94a3b8",
  }));

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto">

      {/* ── TOP KPI ROW ───────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Live Pipeline Snapshot
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Total Leads" value={kpis.totalLeads} icon={Users} href="/leads" />
          <KpiCard
            label="Received Today" value={kpis.leadsToday} icon={CalendarClock}
            iconClass={kpis.leadsToday > 0 ? "text-green-600" : "text-muted-foreground"}
            valueClass={kpis.leadsToday > 0 ? "text-green-600" : ""}
            href="/leads?filter=today"
          />
          <KpiCard
            label="To Action Today" value={kpis.toActionToday} icon={Zap}
            iconClass={kpis.toActionToday > 0 ? "text-orange-600" : "text-muted-foreground"}
            valueClass={kpis.toActionToday > 0 ? "text-orange-600" : ""}
            href="/leads?filter=to_action_today" urgent={kpis.toActionToday > 0}
          />
          <KpiCard
            label="Pending First Action" value={kpis.pendingFirstAction} icon={Eye}
            iconClass={kpis.pendingFirstAction > 0 ? "text-yellow-600" : "text-muted-foreground"}
            valueClass={kpis.pendingFirstAction > 0 ? "text-yellow-600" : ""}
            href="/leads?filter=pending_action"
          />
          <KpiCard
            label="Hot Leads" value={kpis.hotLeads} icon={Flame}
            iconClass="text-red-500" valueClass="text-red-600"
            href="/leads?temperature=Hot"
          />
          <KpiCard
            label="Overdue Follow-ups" value={kpis.overdueFollowUps} icon={AlertTriangle}
            iconClass={kpis.overdueFollowUps > 0 ? "text-destructive" : "text-muted-foreground"}
            valueClass={kpis.overdueFollowUps > 0 ? "text-destructive" : ""}
            href="/leads?filter=overdue_followup" urgent={kpis.overdueFollowUps > 0}
          />
        </div>
      </section>

      {/* ── LEAD ACTIVITY STATUS ─────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Lead Activity Status
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <KpiCard label="Actioned" value={kpis.leadsActioned} icon={CheckCircle2} iconClass="text-green-600" href="/leads?filter=actioned" />
          <KpiCard label="No Activity" value={kpis.noActivityLeads} icon={XCircle} href="/leads?filter=no_activity" />
          <KpiCard
            label={`Stale (${staleDays}d+)`} value={kpis.staleLeads} icon={Clock}
            iconClass={kpis.staleLeads > 0 ? "text-amber-600" : "text-muted-foreground"}
            valueClass={kpis.staleLeads > 0 ? "text-amber-600" : ""}
            href={`/leads?filter=stale&stale_days=${staleDays}`}
          />
          <KpiCard label="Warm Leads" value={kpis.warmLeads} icon={Thermometer} iconClass="text-orange-500" href="/leads?temperature=Warm" />
          <KpiCard label="Cold Leads" value={kpis.coldLeads} icon={Snowflake} iconClass="text-blue-500" href="/leads?temperature=Cold" />
          <KpiCard label="Today Follow-ups" value={kpis.todayFollowUps} icon={CalendarClock} iconClass="text-green-600" href="/follow-ups" />
        </div>
      </section>

      {/* ── SMART INSIGHTS ───────────────────────────────────────────── */}
      {insights.length > 0 && (
        <section>
          <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10 dark:border-amber-900/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <Lightbulb className="h-4 w-4" />
                Smart Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {insights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                    {insight}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── CHARTS ROW: FUNNEL + OPPORTUNITIES + SOURCE ───────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Lead Intelligence
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Pipeline Funnel */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Pipeline Funnel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {sortedFunnel.map((s) => {
                  const max = sortedFunnel.reduce((m, r) => Math.max(m, r.count), 1);
                  const pct = Math.round((s.count / max) * 100);
                  return (
                    <Link key={s.stage} href={`/leads?status=${s.stage}`} className="group block">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="w-24 text-xs text-muted-foreground shrink-0 group-hover:text-foreground transition-colors">
                          {STAGE_LABELS[s.stage] ?? s.stage}
                        </span>
                        <div className="flex-1 h-5 bg-muted/40 rounded overflow-hidden">
                          <div
                            className="h-full bg-primary/70 group-hover:bg-primary transition-colors rounded"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-8 text-right font-semibold text-xs">{s.count}</span>
                      </div>
                    </Link>
                  );
                })}
                {sortedFunnel.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">No data</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Leads by Opportunity */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Leads by Opportunity</CardTitle>
                <Link href="/opportunities" className="text-xs text-primary hover:underline">All</Link>
              </div>
            </CardHeader>
            <CardContent>
              {leadsPerOpportunity.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No opportunity data</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={leadsPerOpportunity} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 4 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, "Leads"]} />
                    <Bar dataKey="count" fill="#6366f1" radius={[0, 3, 3, 0]} cursor="pointer" activeBar={{ fill: "#4f46e5" }}
                      onClick={(data: { id?: string; name?: string }) => {
                        const oppId = leadsPerOpportunity.find((o) => o.name === data.name)?.id;
                        if (oppId) router.push(`/leads?opportunity_id=${oppId}`);
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Leads by Source */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Leads by Source</CardTitle>
            </CardHeader>
            <CardContent>
              {sourceDistribution.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No source data</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={sourceDistribution.map((s) => ({ name: s.source ?? "Unknown", value: s.count }))}
                    layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 4 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, "Leads"]} />
                    <Bar dataKey="value" fill="#8b5cf6" radius={[0, 3, 3, 0]} cursor="pointer" activeBar={{ fill: "#7c3aed" }}
                      onClick={(data: { name?: string }) => {
                        if (data.name && data.name !== "Unknown")
                          router.push(`/leads?source=${encodeURIComponent(data.name)}`);
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── SALES OWNER + TEMPERATURE ─────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Sales Owner Performance */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                Sales Owner Performance
                <span className="text-xs text-muted-foreground ml-1">(active leads)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {salesOwnerStats.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No data</p>
              ) : (
                <div className="space-y-2.5">
                  {salesOwnerStats.map((owner) => {
                    const max = salesOwnerStats.reduce((m, r) => Math.max(m, r.count), 1);
                    const pct = Math.round((owner.count / max) * 100);
                    return (
                      <Link key={owner.id} href={`/leads?assigned_to=${owner.id}`} className="group block">
                        <div className="flex items-center gap-2">
                          <span className="w-32 text-xs truncate group-hover:text-primary transition-colors">{owner.name}</span>
                          <div className="flex-1 h-5 bg-muted/40 rounded overflow-hidden">
                            <div
                              className="h-full bg-green-500/70 group-hover:bg-green-500 transition-colors rounded"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-8 text-right font-semibold text-xs">{owner.count}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Temperature Split */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Temperature Split</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={tempData}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={80} paddingAngle={3}
                    dataKey="value" cursor="pointer"
                    onMouseEnter={(_, i) => setActivePieIndex(i)}
                    onMouseLeave={() => setActivePieIndex(undefined)}
                    onClick={(d) => {
                      if (d?.name && d.name !== "Unknown") router.push(`/leads?temperature=${d.name}`);
                    }}
                  >
                    {tempData.map((entry, i) => (
                      <Cell key={i} fill={entry.color}
                        opacity={activePieIndex === undefined || activePieIndex === i ? 1 : 0.45}
                        style={{ transition: "opacity 0.15s ease" }}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, "Leads"]} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── TODAY'S ACTION QUEUE ─────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Today&apos;s Action Queue
        </h2>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4 text-orange-500" />
                Priority Lead Actions
                <Badge variant="secondary">{actionQueue.length}</Badge>
              </CardTitle>
              <Link href="/leads?filter=to_action_today" className="text-xs text-primary hover:underline">
                View all →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {actionQueue.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                🎉 No urgent actions today — great work!
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                      <th className="text-left px-4 py-2">Lead</th>
                      <th className="text-left px-3 py-2">Temp</th>
                      <th className="text-left px-3 py-2 hidden md:table-cell">Source</th>
                      <th className="text-left px-3 py-2 hidden lg:table-cell">Opportunity</th>
                      <th className="text-left px-3 py-2 hidden md:table-cell">Assigned To</th>
                      <th className="text-left px-3 py-2">Follow-up</th>
                      <th className="text-left px-3 py-2 hidden lg:table-cell">Stage</th>
                      <th className="text-right px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actionQueue.map((lead) => {
                      const isOverdue = lead.next_followup_date && new Date(lead.next_followup_date) < new Date();
                      return (
                        <tr key={lead.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5">
                            <Link href={`/leads/${lead.id}`} className="hover:underline">
                              <p className="font-medium text-sm leading-tight">{lead.full_name}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{lead.lead_number}</p>
                              {lead.phone && <p className="text-[10px] text-muted-foreground">{lead.phone}</p>}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5"><TempBadge temp={lead.temperature} /></td>
                          <td className="px-3 py-2.5 hidden md:table-cell text-xs text-muted-foreground">{lead.lead_source ?? "—"}</td>
                          <td className="px-3 py-2.5 hidden lg:table-cell text-xs">
                            {lead.opportunity_name ? (
                              <Link href={`/opportunities/${lead.opportunity_id}`} className="text-primary hover:underline">
                                {lead.opportunity_name}
                              </Link>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2.5 hidden md:table-cell text-xs text-muted-foreground">{lead.assigned_to_name}</td>
                          <td className="px-3 py-2.5">
                            {lead.next_followup_date ? (
                              <span className={`text-xs font-medium ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
                                {isOverdue ? "⚠ " : ""}{formatShortDate(lead.next_followup_date)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Not set</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 hidden lg:table-cell">
                            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                              {lead.activity_stage ?? lead.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Link href={`/leads/${lead.id}#note`} title="Add Note"
                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                <MessageSquare className="h-3.5 w-3.5" />
                              </Link>
                              <Link href={`/leads/${lead.id}#call`} title="Log Call"
                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                <PhoneCall className="h-3.5 w-3.5" />
                              </Link>
                              <Link href={`/leads/${lead.id}#followup`} title="Create Follow-Up"
                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                <Plus className="h-3.5 w-3.5" />
                              </Link>
                              <Link href={`/leads/${lead.id}`} title="Open Lead"
                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                <Eye className="h-3.5 w-3.5" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── TODAY'S FOCUS ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Today&apos;s Focus
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-green-600" />
                Today&apos;s Follow-ups
                <Badge variant="secondary" className="ml-auto">{todayLeads.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {todayLeads.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No follow-ups scheduled for today</p>
              ) : (
                <div className="space-y-1.5">
                  {todayLeads.slice(0, 8).map((l) => (
                    <Link key={l.id} href={`/leads/${l.id}`}
                      className="flex items-start justify-between gap-2 p-2 rounded-lg hover:bg-muted/30 transition-colors border border-transparent hover:border-border"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{l.full_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-muted-foreground font-mono">{l.lead_number}</span>
                          <TempBadge temp={l.temperature} />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{l.assigned_to_name}</p>
                      </div>
                      {l.potential_lead_value ? (
                        <span className="text-xs font-medium text-primary whitespace-nowrap shrink-0">{fc(l.potential_lead_value)}</span>
                      ) : null}
                    </Link>
                  ))}
                  {todayLeads.length > 8 && (
                    <Link href="/follow-ups" className="block text-xs text-center text-primary py-1 hover:underline">
                      +{todayLeads.length - 8} more → View All
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Overdue Follow-ups
                <Badge variant="destructive" className="ml-auto">{overdueLeads.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {overdueLeads.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No overdue follow-ups</p>
              ) : (
                <div className="space-y-1.5">
                  {overdueLeads.slice(0, 7).map((l) => (
                    <Link key={l.id} href={`/leads/${l.id}`}
                      className="flex items-start justify-between gap-2 p-2 rounded-lg hover:bg-red-50/50 dark:hover:bg-red-950/20 transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-900"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{l.full_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <TempBadge temp={l.temperature} />
                          <span className="text-[10px] text-destructive font-medium">{l.days_overdue}d overdue</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{l.assigned_to_name}</p>
                      </div>
                      {l.potential_lead_value ? (
                        <span className="text-xs font-medium text-primary whitespace-nowrap shrink-0">{fc(l.potential_lead_value)}</span>
                      ) : null}
                    </Link>
                  ))}
                  {overdueLeads.length > 7 && (
                    <Link href="/leads?filter=overdue_followup" className="block text-xs text-center text-destructive py-1 hover:underline">
                      +{overdueLeads.length - 7} more → View All
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
