"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, UserPlus, TrendingUp, MapPin, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DayMetrics {
  new_leads: number;
  meaningful_actions: number;
  site_visits: number;
  completed_followups: number;
}

interface CalendarData {
  month: string;
  days: Record<string, DayMetrics>;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function monthTotal(data: CalendarData, key: keyof DayMetrics) {
  return Object.values(data.days).reduce((sum, d) => sum + d[key], 0);
}

// ── Summary stat card ─────────────────────────────────────────────────────────

function SumCard({
  icon: Icon, label, value, color, bg,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <Card className="p-0">
      <CardContent className={`py-3 px-4 rounded-lg ${bg}`}>
        <div className="flex items-center gap-1.5 mb-1">
          <Icon className={`h-3.5 w-3.5 ${color}`} />
          <span className="text-[11px] text-muted-foreground">{label}</span>
        </div>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ActivityCalendar({
  isManagerOrAdmin,
  currentUserId,
  users,
}: {
  isManagerOrAdmin: boolean;
  currentUserId: string;
  users: { id: string; name: string }[];
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [agentFilter, setAgentFilter] = useState(isManagerOrAdmin ? "all" : currentUserId);
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ month: `${year}-${pad(month)}` });
    if (agentFilter && agentFilter !== "all") params.set("agent", agentFilter);
    const res = await fetch(`/api/dashboard/activity-calendar?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [year, month, agentFilter]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
    setSelectedDay(null);
  }

  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
    setSelectedDay(null);
  }

  // Calendar grid: pad start with empty cells
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date().toISOString().split("T")[0];

  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const getDayKey = (d: number) => `${year}-${pad(month)}-${pad(d)}`;

  // Max value in month for heat-map intensity
  const maxActivity = data
    ? Math.max(1, ...Object.values(data.days).map((d) => d.new_leads + d.meaningful_actions + d.site_visits))
    : 1;

  const selectedMetrics = selectedDay ? data?.days[selectedDay] : null;

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        {/* Month navigation */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="w-40 text-center font-semibold text-sm">
            {MONTHS[month - 1]} {year}
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-8 ml-1"
            onClick={() => {
              setYear(now.getFullYear());
              setMonth(now.getMonth() + 1);
              setSelectedDay(null);
            }}
          >
            Today
          </Button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />New Leads</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />Actions</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />Site Visits</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />Follow-ups</span>
        </div>

        {/* Agent filter — admins/managers only */}
        {isManagerOrAdmin && (
          <Select value={agentFilter} onValueChange={(v) => { if (v) { setAgentFilter(v); setSelectedDay(null); } }}>
            <SelectTrigger className="h-8 text-xs w-40">
              <SelectValue>
                {agentFilter === "all" ? "All Agents" : users.find((u) => u.id === agentFilter)?.name ?? "Agent"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ── Monthly summary cards ── */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SumCard icon={UserPlus}    label="New Leads"       value={monthTotal(data, "new_leads")}          color="text-emerald-600" bg="bg-emerald-50/60" />
          <SumCard icon={TrendingUp}  label="Stage Actions"   value={monthTotal(data, "meaningful_actions")} color="text-blue-600"    bg="bg-blue-50/60" />
          <SumCard icon={MapPin}      label="Site Visits"     value={monthTotal(data, "site_visits")}        color="text-purple-600"  bg="bg-purple-50/60" />
          <SumCard icon={CheckCircle2} label="Follow-ups Done" value={monthTotal(data, "completed_followups")} color="text-orange-600" bg="bg-orange-50/60" />
        </div>
      )}

      {/* ── Calendar grid ── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {DAYS.map((d) => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold text-muted-foreground tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className={`grid grid-cols-7 transition-opacity ${loading ? "opacity-40" : "opacity-100"}`}>
          {cells.map((day, i) => {
            if (!day) {
              return (
                <div
                  key={`empty-${i}`}
                  className="min-h-[80px] sm:min-h-[100px] border-b border-r last:border-r-0 bg-muted/10"
                />
              );
            }

            const key = getDayKey(day);
            const m = data?.days[key];
            const isToday = key === today;
            const isSelected = key === selectedDay;
            const total = m ? m.new_leads + m.meaningful_actions + m.site_visits : 0;
            const intensity = total > 0 ? Math.min(1, total / maxActivity) : 0;
            const hasActivity = total > 0;

            // Subtle background heat tint for active days
            const heatStyle = hasActivity && !isSelected
              ? { backgroundColor: `rgba(59,130,246,${intensity * 0.07})` }
              : {};

            return (
              <button
                key={key}
                style={heatStyle}
                onClick={() => setSelectedDay(isSelected ? null : key)}
                className={`min-h-[80px] sm:min-h-[100px] p-1.5 sm:p-2 border-b border-r last:border-r-0 text-left flex flex-col gap-1 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-1 focus-visible:ring-ring ${
                  isSelected ? "bg-primary/8 ring-inset ring-1 ring-primary" : ""
                }`}
              >
                {/* Date number */}
                <span
                  className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full shrink-0 ${
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground"
                  }`}
                >
                  {day}
                </span>

                {/* Metric badges */}
                {m && (
                  <div className="flex flex-col gap-0.5 w-full">
                    {m.new_leads > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-100 rounded px-1 leading-[1.4rem] w-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        <span className="truncate">{m.new_leads}<span className="hidden sm:inline"> New</span></span>
                      </span>
                    )}
                    {m.meaningful_actions > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] font-medium text-blue-700 bg-blue-100 rounded px-1 leading-[1.4rem] w-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        <span className="truncate">{m.meaningful_actions}<span className="hidden sm:inline"> Action{m.meaningful_actions > 1 ? "s" : ""}</span></span>
                      </span>
                    )}
                    {m.site_visits > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] font-medium text-purple-700 bg-purple-100 rounded px-1 leading-[1.4rem] w-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                        <span className="truncate">{m.site_visits}<span className="hidden sm:inline"> Visit{m.site_visits > 1 ? "s" : ""}</span></span>
                      </span>
                    )}
                    {m.completed_followups > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] font-medium text-orange-700 bg-orange-100 rounded px-1 leading-[1.4rem] w-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                        <span className="truncate">{m.completed_followups}<span className="hidden sm:inline"> Done</span></span>
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Loading overlay */}
        {loading && (
          <div className="flex items-center justify-center py-4 border-t">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* ── Day detail panel ── */}
      {selectedDay && (
        <Card className="border-primary/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">
                {new Date(`${selectedDay}T12:00:00`).toLocaleDateString("en-IN", {
                  weekday: "long", day: "numeric", month: "long", year: "numeric",
                })}
              </h3>
              <button
                onClick={() => setSelectedDay(null)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                ✕ Close
              </button>
            </div>

            {selectedMetrics ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "New Leads",      value: selectedMetrics.new_leads,          color: "text-emerald-700", bg: "bg-emerald-50",  icon: UserPlus },
                  { label: "Stage Actions",  value: selectedMetrics.meaningful_actions, color: "text-blue-700",    bg: "bg-blue-50",     icon: TrendingUp },
                  { label: "Site Visits",    value: selectedMetrics.site_visits,        color: "text-purple-700",  bg: "bg-purple-50",   icon: MapPin },
                  { label: "Follow-ups Done",value: selectedMetrics.completed_followups,color: "text-orange-700",  bg: "bg-orange-50",   icon: CheckCircle2 },
                ].map(({ label, value, color, bg, icon: Icon }) => (
                  <div key={label} className={`${bg} rounded-lg p-3`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className={`h-3.5 w-3.5 ${color}`} />
                      <p className="text-[11px] text-muted-foreground">{label}</p>
                    </div>
                    <p className={`text-3xl font-bold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No activity recorded on this day.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
