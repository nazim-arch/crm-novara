"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles, Loader2, AlertTriangle, RefreshCw, TrendingUp,
  Users, Clock, CheckCircle2, Flame, ArrowRight, Lightbulb,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PipelineInsight {
  narrative: string;
  attention_items: { lead_name: string; lead_number: string; reason: string; urgency: "high" | "medium" }[];
  team_insight: string;
  health: "Healthy" | "Needs Attention" | "At Risk";
}

interface LostInsight {
  pattern_summary: string;
  top_patterns: { pattern: string; count: number; example: string }[];
  opportunity_insight: string;
  re_engagement_candidates: string[];
}

interface DigestResult {
  stats: {
    temperature: Record<string, number>;
    stages: Record<string, number>;
    stale_count: number;
    overdue_followups: number;
    won_count: number;
    lost_count: number;
    lost_reason_breakdown: Record<string, number>;
  };
  stale_leads: { id: string; full_name: string; lead_number: string; status: string; temperature: string; days_stale: number | null; assigned_to: { name: string } }[];
  team_activity: { name: string; count: number }[];
  wins: { lead: { full_name: string; lead_number: string } | null; changed_at: string }[];
  lost_leads: { full_name: string; lost_reason: string | null; budget_min: number | null; budget_max: number | null; location_preference: string | null; alternate_requirement: string | null; lost_notes: string | null }[];
  pipeline_insight: PipelineInsight | null;
  lost_insight: LostInsight | null;
  ai_unavailable: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().split("T")[0]; }
function nDaysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split("T")[0]; }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; }

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className={`text-2xl font-bold ${color ?? "text-foreground"}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function HealthBadge({ health }: { health: PipelineInsight["health"] }) {
  const map: Record<string, string> = {
    "Healthy": "bg-green-100 text-green-700",
    "Needs Attention": "bg-amber-100 text-amber-700",
    "At Risk": "bg-red-100 text-red-700",
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${map[health] ?? "bg-muted text-muted-foreground"}`}>
      {health}
    </span>
  );
}

function TempBadge({ temp }: { temp: string }) {
  const map: Record<string, string> = {
    Hot: "bg-red-100 text-red-700", Warm: "bg-amber-100 text-amber-700",
    Cold: "bg-blue-100 text-blue-700", FollowUpLater: "bg-purple-100 text-purple-700",
  };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${map[temp] ?? "bg-muted text-muted-foreground"}`}>{temp}</span>;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function PipelineDigestClient({ users }: { users: { id: string; name: string }[] }) {
  const [dateFrom, setDateFrom] = useState(nDaysAgo(29));
  const [dateTo, setDateTo] = useState(today());
  const [agentId, setAgentId] = useState("all");
  const [activePreset, setActivePreset] = useState("last30");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DigestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyPreset(preset: string) {
    setActivePreset(preset);
    if (preset === "last7") { setDateFrom(nDaysAgo(6)); setDateTo(today()); }
    else if (preset === "last30") { setDateFrom(nDaysAgo(29)); setDateTo(today()); }
    else if (preset === "thismonth") { setDateFrom(monthStart()); setDateTo(today()); }
  }

  async function generate() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/pipeline-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo, agent_id: agentId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setError(err.error ?? "Generation failed. Please try again.");
        return;
      }
      setResult(await res.json());
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const presets = [
    { key: "last7", label: "Last 7 Days" },
    { key: "last30", label: "Last 30 Days" },
    { key: "thismonth", label: "This Month" },
  ];

  return (
    <div className="space-y-6">
      {/* ── Controls ── */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex gap-1">
          {presets.map((p) => (
            <button key={p.key} onClick={() => applyPreset(p.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                activePreset === p.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-muted-foreground"
              }`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setActivePreset("custom"); }} className="h-8 text-xs w-36" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setActivePreset("custom"); }} className="h-8 text-xs w-36" />
        </div>
        {users.length > 0 && (
          <Select value={agentId} onValueChange={(v) => v && setAgentId(v)}>
            <SelectTrigger className="h-8 text-xs w-40">
              <SelectValue>{agentId === "all" ? "All Agents" : users.find((u) => u.id === agentId)?.name ?? "Agent"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button onClick={generate} disabled={loading} className="h-8 text-xs gap-1.5 ml-auto">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {loading ? "Generating…" : result ? "Regenerate" : "Generate Digest"}
        </Button>
      </div>

      {/* ── AI Unavailable Banner ── */}
      {result?.ai_unavailable && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>AI narrative unavailable — Claude API key not configured. Showing data only. Ask an admin to add the key in Settings.</p>
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs gap-1" onClick={generate}>
            <RefreshCw className="h-3 w-3" />Try Again
          </Button>
        </div>
      )}

      {/* ── Loading Skeletons ── */}
      {loading && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <Skeleton className="h-5 w-48" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1,2,3,4].map((i) => <Skeleton key={i} className="h-16" />)}
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <div className="space-y-2 pt-2">
              {[1,2,3].map((i) => <Skeleton key={i} className="h-10" />)}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <Skeleton className="h-5 w-56" />
            <div className="flex gap-2">
              {[1,2,3].map((i) => <Skeleton key={i} className="h-7 w-24" />)}
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      )}

      {/* ── Idle State ── */}
      {!loading && !result && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed bg-card">
          <Sparkles className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <p className="text-base font-medium">Pipeline Intelligence Digest</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Select a date range and click Generate. Claude will scan your entire pipeline and surface what needs your attention — including patterns in leads that dropped off.
          </p>
          <Button onClick={generate} className="mt-5 gap-2">
            <Sparkles className="h-4 w-4" />Generate Digest
          </Button>
        </div>
      )}

      {/* ── Results ── */}
      {!loading && result && (
        <div className="space-y-5">

          {/* ── Section 1: Active Pipeline ── */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b bg-muted/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold text-sm">Active Pipeline Health</h2>
              </div>
              {result.pipeline_insight && <HealthBadge health={result.pipeline_insight.health} />}
            </div>

            <div className="p-5 space-y-5">
              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Hot Leads" value={result.stats.temperature.Hot ?? 0} color="text-red-600" />
                <StatCard label="Warm Leads" value={result.stats.temperature.Warm ?? 0} color="text-amber-600" />
                <StatCard label="Stale (7d+)" value={result.stats.stale_count} color={result.stats.stale_count > 5 ? "text-destructive" : "text-foreground"} />
                <StatCard label="Overdue Follow-ups" value={result.stats.overdue_followups} color={result.stats.overdue_followups > 0 ? "text-orange-600" : "text-foreground"} />
              </div>

              {/* Won this period */}
              {result.wins.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="text-sm font-medium text-emerald-700">Won this period:</span>
                  {result.wins.map((w, i) => (
                    <span key={i} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                      {w.lead?.full_name ?? "—"}
                    </span>
                  ))}
                </div>
              )}

              {/* AI Narrative */}
              {result.pipeline_insight ? (
                <div className="rounded-lg bg-blue-50/60 border border-blue-100 p-3.5">
                  <p className="text-sm text-foreground leading-relaxed">{result.pipeline_insight.narrative}</p>
                </div>
              ) : result.ai_unavailable ? null : (
                <div className="text-xs text-muted-foreground italic">AI narrative unavailable for this section.</div>
              )}

              {/* Needs Attention */}
              {result.stale_leads.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />Needs Attention
                  </p>
                  <div className="divide-y rounded-lg border overflow-hidden">
                    {result.stale_leads.slice(0, 8).map((l) => (
                      <div key={l.id} className={`flex items-center gap-3 px-3 py-2.5 ${l.temperature === "Hot" ? "bg-red-50/40" : ""}`}>
                        <TempBadge temp={l.temperature} />
                        <div className="min-w-0 flex-1">
                          <Link href={`/leads/${l.id}`} target="_blank" className="font-medium text-sm hover:underline truncate block">
                            {l.full_name}
                          </Link>
                          <p className="text-[11px] text-muted-foreground">
                            {l.status} · {l.days_stale != null ? `${l.days_stale}d no contact` : "never contacted"} · {l.assigned_to.name}
                          </p>
                        </div>
                        {result.pipeline_insight?.attention_items.find((a) => a.lead_name === l.full_name)?.urgency === "high" && (
                          <span className="text-[10px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">URGENT</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {result.stale_leads.length > 8 && (
                    <p className="text-xs text-muted-foreground">+{result.stale_leads.length - 8} more stale leads</p>
                  )}
                </div>
              )}

              {/* Team Activity */}
              {result.team_activity.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />Team Activity
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {result.team_activity.map((t) => (
                      <div key={t.name} className="rounded-lg border bg-background px-3 py-2 flex items-center justify-between">
                        <span className="text-xs font-medium truncate">{t.name}</span>
                        <span className="text-xs text-muted-foreground ml-2 shrink-0">{t.count} actions</span>
                      </div>
                    ))}
                  </div>
                  {result.pipeline_insight?.team_insight && (
                    <p className="text-xs text-muted-foreground italic">{result.pipeline_insight.team_insight}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Section 2: Dropped Lead Insights ── */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b bg-muted/30 flex items-center gap-2">
              <Flame className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Dropped Leads — What Were They Looking For?</h2>
              <span className="ml-auto text-xs text-muted-foreground">{result.stats.lost_count} lead{result.stats.lost_count !== 1 ? "s" : ""} in period</span>
            </div>

            <div className="p-5 space-y-5">
              {result.stats.lost_count === 0 ? (
                <div className="flex items-center gap-2 py-4 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />No dropped leads in this period.
                </div>
              ) : (
                <>
                  {/* Lost reason breakdown */}
                  {Object.keys(result.stats.lost_reason_breakdown).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lost Reasons</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(result.stats.lost_reason_breakdown)
                          .sort((a, b) => b[1] - a[1])
                          .map(([reason, count]) => (
                            <span key={reason} className="px-2.5 py-1 rounded-full bg-muted text-xs font-medium">
                              {reason} <span className="font-bold ml-1">{count}</span>
                            </span>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* AI Pattern Summary */}
                  {result.lost_insight ? (
                    <>
                      <div className="rounded-lg bg-background border p-3.5 space-y-2">
                        <p className="text-sm text-foreground leading-relaxed">{result.lost_insight.pattern_summary}</p>
                      </div>

                      {/* Top patterns */}
                      {result.lost_insight.top_patterns.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Key Patterns</p>
                          <div className="space-y-1.5">
                            {result.lost_insight.top_patterns.map((p, i) => (
                              <div key={i} className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
                                <span className="text-xs font-bold text-muted-foreground shrink-0 mt-0.5">{p.count}×</span>
                                <div>
                                  <p className="text-sm font-medium">{p.pattern}</p>
                                  {p.example && <p className="text-xs text-muted-foreground italic mt-0.5">"{p.example}"</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Opportunity insight */}
                      {result.lost_insight.opportunity_insight && (
                        <div className="rounded-lg bg-amber-50/70 border border-amber-200 p-3.5 flex items-start gap-2.5">
                          <Lightbulb className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-amber-700 mb-1">Market Insight</p>
                            <p className="text-sm text-amber-900 leading-relaxed">{result.lost_insight.opportunity_insight}</p>
                          </div>
                        </div>
                      )}

                      {/* Re-engagement candidates */}
                      {result.lost_insight.re_engagement_candidates.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <ArrowRight className="h-3.5 w-3.5" />Re-engagement Candidates
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {result.lost_insight.re_engagement_candidates.map((name, i) => (
                              <span key={i} className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium">{name}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : result.ai_unavailable ? null : (
                    <div className="text-xs text-muted-foreground italic">AI pattern analysis unavailable for this section.</div>
                  )}

                  {/* Raw notes from dropped leads — shown when AI is unavailable */}
                  {result.ai_unavailable && result.lost_leads.slice(0, 10).some((l) => l.alternate_requirement || l.lost_notes) && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">What They Were Looking For</p>
                      <div className="divide-y rounded-lg border overflow-hidden">
                        {result.lost_leads.slice(0, 10)
                          .filter((l) => l.alternate_requirement ?? l.lost_notes)
                          .map((l, i) => (
                            <div key={i} className="px-3 py-2.5">
                              <p className="text-xs font-medium">{l.full_name} {l.lost_reason && <span className="text-muted-foreground">· {l.lost_reason}</span>}</p>
                              <p className="text-xs text-muted-foreground italic mt-0.5">"{(l.alternate_requirement ?? l.lost_notes ?? "").slice(0, 200)}"</p>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
