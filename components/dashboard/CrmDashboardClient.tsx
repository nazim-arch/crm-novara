"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Users, Flame, Activity, Trophy, CalendarClock, AlertTriangle,
  TrendingUp, DollarSign, Wallet, PiggyBank, Target,
  CheckSquare, Clock, CheckCircle2, XCircle, Briefcase, BellOff,
  MapPin, Handshake,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Charts pull in recharts (+ d3). Load them lazily so the landing-page bundle
// stays light; a matching-height skeleton avoids layout shift while they arrive.
const ChartSkeleton = ({ height }: { height: number }) => (
  <div className="animate-pulse rounded-lg bg-muted" style={{ height }} />
);
const LeadIntelligenceCharts = dynamic(
  () => import("@/components/dashboard/LeadIntelligenceCharts").then((m) => m.LeadIntelligenceCharts),
  { ssr: false, loading: () => <ChartSkeleton height={440} /> }
);
const ClientBarChart = dynamic(
  () => import("@/components/dashboard/ClientBarChart").then((m) => m.ClientBarChart),
  { ssr: false, loading: () => <ChartSkeleton height={250} /> }
);

// ── Types ──────────────────────────────────────────────────────────────────

interface Kpis {
  totalLeads: number;
  hotLeads: number;
  activeLeads: number;
  wonLeads: number;
  lostLeads: number;
  newLeadsInRange: number;
  wonLeadsInRange: number;
  siteVisitsInRange: number;
  bookedInRange: number;
  todayFollowUps: number;
  overdueFollowUps: number;
  noFollowUpCount: number;
  pipelineValue: number;
  totalSalesValue: number;
  possibleRevenue: number;
  closedRevenue: number;
  totalExpense: number;
  netProfit: number;
}

interface TodayLead {
  id: string;
  full_name: string;
  lead_number: string;
  phone: string | null;
  temperature: string | null;
  status: string;
  potential_lead_value: number | null;
  next_followup_date: string | null;
  followup_type: string | null;
  assigned_to_name: string;
}

interface OverdueLead {
  id: string;
  full_name: string;
  lead_number: string;
  temperature: string | null;
  status: string;
  potential_lead_value: number | null;
  next_followup_date: string | null;
  days_overdue: number;
  assigned_to_name: string;
}

interface StaleHotLead {
  id: string;
  full_name: string;
  lead_number: string;
  potential_lead_value: number | null;
  next_followup_date: string | null;
  assigned_to_name: string;
}

interface StageRow { stage: string; count: number; value: number }
interface TempRow { temp: string | null; count: number }
interface SourceRow { source: string | null; count: number }

interface TopOpportunity {
  id: string;
  name: string;
  opp_number: string;
  possible_revenue: number;
  closed_revenue: number;
  total_expense: number;
  net_profit: number;
  leads_count: number;
}

interface RecentActivity {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_name: string;
  created_at: string;
}

interface TaskStats { todo: number; inProgress: number; done: number; overdue: number }
interface ClientTaskRow { name: string; count: number }
interface OppByRow { opportunity_by: string; count: number; possible_revenue: number }

interface Props {
  canViewFinancials: boolean;
  rangeLabel: string;
  kpis: Kpis;
  todayLeads: TodayLead[];
  overdueLeads: OverdueLead[];
  staleHotLeads: StaleHotLead[];
  stageDistribution: StageRow[];
  temperatureDistribution: TempRow[];
  sourceDistribution: SourceRow[];
  topOpportunities: TopOpportunity[];
  opportunityByBreakdown: OppByRow[];
  recentActivities: RecentActivity[];
  taskStats: TaskStats;
  taskClientDistribution: ClientTaskRow[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fc(n: number) {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function relativeTime(iso: string) {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 2) return "just now";
  if (diff < 60) return `${diff}m ago`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const ACTIVITY_LABELS: Record<string, string> = {
  lead_created: "created a lead",
  lead_updated: "updated a lead",
  stage_changed: "changed stage",
  activity_stage_changed: "changed activity stage",
  note_added: "added a note",
  task_created: "created a task",
  task_completed: "completed a task",
  followup_completed: "completed a follow-up",
  opportunity_created: "created an opportunity",
  expense_added: "added an expense",
  expense_deleted: "deleted an expense",
};

function entityLink(type: string, id: string) {
  if (type === "Lead") return `/leads/${id}`;
  if (type === "Opportunity") return `/opportunities/${id}`;
  if (type === "Task") return `/tasks/${id}`;
  return "#";
}

// ── Sub-components ─────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon,
  iconClass = "text-muted-foreground", valueClass = "", href,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; iconClass?: string; valueClass?: string; href?: string;
}) {
  const inner = (
    <CardContent className="pt-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg bg-muted/40 ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </CardContent>
  );

  if (href) {
    return (
      <Card className="hover:shadow-md transition-shadow">
        <Link href={href} className="block">{inner}</Link>
      </Card>
    );
  }
  return <Card>{inner}</Card>;
}

function TempBadge({ temp }: { temp: string | null }) {
  const map: Record<string, string> = {
    Hot: "bg-red-100 text-red-700 border-red-200",
    Warm: "bg-orange-100 text-orange-700 border-orange-200",
    Cold: "bg-blue-100 text-blue-700 border-blue-200",
    FollowUpLater: "bg-purple-100 text-purple-700 border-purple-200",
  };
  if (!temp) return null;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${map[temp] ?? "bg-muted text-muted-foreground"}`}>
      {temp}
    </span>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function CrmDashboardClient({
  canViewFinancials, rangeLabel, kpis,
  todayLeads, overdueLeads, staleHotLeads,
  stageDistribution, temperatureDistribution, sourceDistribution,
  topOpportunities, opportunityByBreakdown,
  recentActivities, taskStats, taskClientDistribution,
}: Props) {
  return (
    <div className="space-y-8 max-w-[1400px] mx-auto">

      {/* ── Period KPIs ───────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {rangeLabel}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="New Leads" value={kpis.newLeadsInRange} icon={Users} href="/leads" />
          <KpiCard label="Site Visits" value={kpis.siteVisitsInRange} icon={MapPin}
            iconClass="text-sky-500" valueClass={kpis.siteVisitsInRange > 0 ? "text-sky-600" : ""}
            href="/leads?status=SiteVisitCompleted" />
          <KpiCard label="Booked" value={kpis.bookedInRange} icon={Handshake}
            iconClass="text-indigo-500" valueClass={kpis.bookedInRange > 0 ? "text-indigo-600" : ""}
            href="/leads?status=Booked" />
          <KpiCard label="Deals Won" value={kpis.wonLeadsInRange} icon={Trophy} iconClass="text-yellow-500" valueClass="text-yellow-600" />
          <KpiCard label="Today's Follow-ups" value={kpis.todayFollowUps} icon={CalendarClock}
            iconClass={kpis.todayFollowUps > 0 ? "text-green-600" : "text-muted-foreground"}
            valueClass={kpis.todayFollowUps > 0 ? "text-green-600" : ""} href="/follow-ups" />
          <KpiCard label="Overdue Follow-ups" value={kpis.overdueFollowUps} icon={AlertTriangle}
            iconClass={kpis.overdueFollowUps > 0 ? "text-destructive" : "text-muted-foreground"}
            valueClass={kpis.overdueFollowUps > 0 ? "text-destructive" : ""} href="/follow-ups" />
          <KpiCard label="No FU Scheduled" value={kpis.noFollowUpCount} icon={BellOff}
            iconClass={kpis.noFollowUpCount > 0 ? "text-amber-500" : "text-muted-foreground"}
            valueClass={kpis.noFollowUpCount > 0 ? "text-amber-600" : ""}
            href="/leads?filter=no_followup" />
        </div>
      </section>

      {/* ── Pipeline Overview ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Pipeline Overview (All-time)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="Total Leads" value={kpis.totalLeads} icon={Users} href="/leads" />
          <KpiCard label="Active Leads" value={kpis.activeLeads} sub="Excl. Won/Lost/Recycle" icon={Activity} href="/leads" />
          <KpiCard label="Hot Leads" value={kpis.hotLeads} icon={Flame} iconClass="text-red-500" valueClass="text-red-600" href="/leads?temperature=Hot" />
          <KpiCard label="Won (All-time)" value={kpis.wonLeads} icon={Trophy} iconClass="text-yellow-500" valueClass="text-yellow-600" href="/leads?status=Won" />
          <KpiCard label="Lost (All-time)" value={kpis.lostLeads} icon={XCircle} iconClass="text-red-400" valueClass="text-red-500" href="/leads?status=Lost" />
        </div>

        {canViewFinancials && (
          <>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 mt-5">
              Revenue KPIs
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <KpiCard label="Pipeline Value" value={kpis.pipelineValue > 0 ? fc(kpis.pipelineValue) : "—"} sub="Active lead potential" icon={TrendingUp} />
              <KpiCard label="Total Sales Value" value={kpis.totalSalesValue > 0 ? fc(kpis.totalSalesValue) : "—"} sub="All opportunity inventory" icon={DollarSign} href="/opportunities" />
              <KpiCard label="Possible Revenue" value={kpis.possibleRevenue > 0 ? fc(kpis.possibleRevenue) : "—"} sub="Commission (active)" icon={Wallet} iconClass="text-primary" valueClass="text-primary" />
              <KpiCard label="Net Profit" value={kpis.closedRevenue > 0 ? fc(kpis.netProfit) : "—"}
                sub={kpis.totalExpense > 0 ? `Expense: ${fc(kpis.totalExpense)}` : "No expenses"}
                icon={PiggyBank}
                iconClass={kpis.netProfit >= 0 ? "text-green-600" : "text-destructive"}
                valueClass={kpis.netProfit >= 0 ? "text-green-600" : "text-destructive"} />
            </div>
          </>
        )}
      </section>

      {/* ── Today's Focus ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Today&apos;s Focus
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

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
                <div className="space-y-2">
                  {todayLeads.slice(0, 8).map((l) => (
                    <Link key={l.id} href={`/leads/${l.id}`}
                      className="flex items-start justify-between gap-2 p-2 rounded-lg hover:bg-muted/30 transition-colors border border-transparent hover:border-border"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{l.full_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-muted-foreground font-mono">{l.lead_number}</span>
                          <TempBadge temp={l.temperature} />
                          {l.followup_type && <span className="text-[10px] text-muted-foreground">{l.followup_type}</span>}
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
                <div className="space-y-2">
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
                    <Link href="/follow-ups" className="block text-xs text-center text-destructive py-1 hover:underline">
                      +{overdueLeads.length - 7} more → View All
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                Stale Hot Leads
                <Badge className="ml-auto bg-orange-100 text-orange-700 border-orange-200" variant="outline">
                  {staleHotLeads.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {staleHotLeads.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">All hot leads have upcoming follow-ups</p>
              ) : (
                <div className="space-y-2">
                  {staleHotLeads.map((l) => (
                    <Link key={l.id} href={`/leads/${l.id}`}
                      className="flex items-start justify-between gap-2 p-2 rounded-lg hover:bg-orange-50/50 dark:hover:bg-orange-950/20 transition-colors border border-transparent hover:border-orange-200 dark:hover:border-orange-900"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{l.full_name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {l.next_followup_date
                            ? `Last: ${new Date(l.next_followup_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`
                            : "No follow-up set"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{l.assigned_to_name}</p>
                      </div>
                      {l.potential_lead_value ? (
                        <span className="text-xs font-medium text-primary whitespace-nowrap shrink-0">{fc(l.potential_lead_value)}</span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Lead Intelligence ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Lead Intelligence
        </h2>
        <LeadIntelligenceCharts
          stageDistribution={stageDistribution}
          temperatureDistribution={temperatureDistribution}
          sourceDistribution={sourceDistribution}
        />
      </section>

      {/* ── Opportunity & Revenue Intelligence ────────────────────────── */}
      {canViewFinancials && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Opportunity &amp; Revenue Intelligence
          </h2>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Top Active Opportunities
                </CardTitle>
                <Link href="/opportunities" className="text-xs text-primary hover:underline">View All</Link>
              </div>
            </CardHeader>
            <CardContent>
              {topOpportunities.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No active opportunities</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-2 pr-4">Opportunity</th>
                        <th className="text-right py-2 px-4">Possible Revenue</th>
                        <th className="text-right py-2 px-4">Closed Revenue</th>
                        <th className="text-right py-2 px-4">Total Expense</th>
                        <th className="text-right py-2 px-4">Net Profit</th>
                        <th className="text-right py-2 pl-4">Leads</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topOpportunities.map((o) => (
                        <tr key={o.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="py-2 pr-4">
                            <Link href={`/opportunities/${o.id}`} className="hover:text-primary">
                              <p className="font-medium">{o.name}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{o.opp_number}</p>
                            </Link>
                          </td>
                          <td className="py-2 px-4 text-right text-primary font-medium">{o.possible_revenue > 0 ? fc(o.possible_revenue) : "—"}</td>
                          <td className="py-2 px-4 text-right text-green-600 font-medium">{o.closed_revenue > 0 ? fc(o.closed_revenue) : "—"}</td>
                          <td className="py-2 px-4 text-right text-destructive">{o.total_expense > 0 ? fc(o.total_expense) : "—"}</td>
                          <td className={`py-2 px-4 text-right font-semibold ${o.net_profit >= 0 ? "text-green-600" : "text-destructive"}`}>
                            {o.closed_revenue > 0 ? fc(o.net_profit) : "—"}
                          </td>
                          <td className="py-2 pl-4 text-right text-muted-foreground">{o.leads_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {opportunityByBreakdown.length > 0 && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Opportunities by Category
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {opportunityByBreakdown.map((row) => (
                    <div key={row.opportunity_by} className="p-3 rounded-lg border bg-muted/30">
                      <p className="text-xs text-muted-foreground">{row.opportunity_by}</p>
                      <p className="text-lg font-semibold mt-0.5">{row.count}</p>
                      {row.possible_revenue > 0 && <p className="text-xs text-primary mt-0.5">{fc(row.possible_revenue)}</p>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {/* ── Client Workload ───────────────────────────────────────────── */}
      {taskClientDistribution.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Client Workload
          </h2>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Tasks by Client
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ClientBarChart data={taskClientDistribution} />
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Activity Feed + Task Stats ─────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No recent activity</p>
              ) : (
                <div className="space-y-0">
                  {recentActivities.map((a, i) => (
                    <div key={a.id} className={`flex items-start gap-3 py-2.5 ${i < recentActivities.length - 1 ? "border-b" : ""}`}>
                      <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{a.actor_name}</span>
                          {" "}
                          <span className="text-muted-foreground">{ACTIVITY_LABELS[a.action] ?? a.action}</span>
                          {" "}
                          <Link href={entityLink(a.entity_type, a.entity_id)} className="text-primary hover:underline text-xs">
                            ({a.entity_type})
                          </Link>
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
                        {relativeTime(a.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckSquare className="h-4 w-4" />
                Task Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/tasks" className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">To Do</span>
                </div>
                <span className="text-lg font-bold">{taskStats.todo}</span>
              </Link>
              <Link href="/tasks" className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-400">In Progress</span>
                </div>
                <span className="text-lg font-bold text-blue-700 dark:text-blue-400">{taskStats.inProgress}</span>
              </Link>
              <Link href="/tasks" className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-950/50 transition-colors">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">Done</span>
                </div>
                <span className="text-lg font-bold text-green-700 dark:text-green-400">{taskStats.done}</span>
              </Link>
              <Link href="/tasks" className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium text-destructive">Overdue</span>
                </div>
                <span className="text-lg font-bold text-destructive">{taskStats.overdue}</span>
              </Link>
              <div className="pt-1">
                <Link href="/tasks" className="block text-xs text-center text-primary hover:underline py-1">
                  Manage Tasks →
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
