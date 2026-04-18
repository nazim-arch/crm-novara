"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, PieChart, Pie, Legend, CartesianGrid,
} from "recharts";

type DailyRow = { date: string; sessions: number; hours: number; occupancy_pct: number };
type WeeklyRow = { day: string; sessions: number; revenue: number };
type MonthlyRow = { month: string; sessions: number; revenue: number; occupancy_pct: number };
type RevRow = { name: string; value: number; fill: string };
type PeakRow = { slot: string; bookings: number; demand: number };

interface ChartData {
  dailyData: DailyRow[];
  weeklyData: WeeklyRow[];
  monthlyData: MonthlyRow[];
  revBreakdown: RevRow[];
  peakHoursData: PeakRow[];
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-4">{title}</h3>
      {children}
    </div>
  );
}

export function PodcastDashboardCharts({ data }: { data: ChartData }) {
  const { dailyData, weeklyData, monthlyData, revBreakdown, peakHoursData } = data;
  const hasRevData = revBreakdown.some(r => r.value > 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Daily Utilisation */}
      <ChartCard title="Daily Utilisation (This Month)">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dailyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} interval={4} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
              formatter={(v, name) => [name === "occupancy_pct" ? `${v}%` : v, name === "occupancy_pct" ? "Occupancy" : name === "sessions" ? "Sessions" : "Hours"]}
            />
            <Bar dataKey="sessions" name="sessions" fill="#7c3aed" radius={[3, 3, 0, 0]} />
            <Bar dataKey="hours" name="hours" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Weekly Booking Pattern */}
      <ChartCard title="Weekly Booking Pattern (YTD)">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={weeklyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
              formatter={(v, name) => [name === "revenue" ? `₹${Number(v).toLocaleString("en-IN")}` : v, name === "revenue" ? "Revenue" : "Sessions"]}
            />
            <Bar dataKey="sessions" fill="#7c3aed" radius={[3, 3, 0, 0]} name="sessions" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Peak Hours Analysis */}
      {peakHoursData.length > 0 ? (
        <ChartCard title="Peak Hours Demand Index">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={peakHoursData} margin={{ top: 4, right: 8, left: -20, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="slot" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                formatter={(v, name) => [name === "demand" ? `${v}%` : v, name === "demand" ? "Demand Index" : "Bookings"]}
              />
              <Bar dataKey="demand" radius={[3, 3, 0, 0]}>
                {peakHoursData.map((entry, i) => (
                  <Cell key={i} fill={entry.demand >= 80 ? "#ef4444" : entry.demand >= 50 ? "#f59e0b" : "#7c3aed"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : (
        <ChartCard title="Peak Hours Demand Index">
          <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
            No booking data for this month yet
          </div>
        </ChartCard>
      )}

      {/* Revenue Breakdown */}
      {hasRevData ? (
        <ChartCard title="Revenue Breakdown">
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={220}>
              <PieChart>
                <Pie data={revBreakdown} dataKey="value" cx="50%" cy="50%" outerRadius={80} paddingAngle={3}>
                  {revBreakdown.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                  formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, ""]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-3 flex-1">
              {revBreakdown.map(r => (
                <div key={r.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ background: r.fill }} />
                    <span className="text-muted-foreground">{r.name}</span>
                  </div>
                  <span className="font-semibold">₹{r.value.toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      ) : (
        <ChartCard title="Revenue Breakdown">
          <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
            No revenue data for this month yet
          </div>
        </ChartCard>
      )}

      {/* Monthly Performance (full year) */}
      <div className="lg:col-span-2">
        <ChartCard title={`Monthly Performance Overview`}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickLine={false} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickLine={false} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                formatter={(v, name) => [
                  name === "occupancy_pct" ? `${v}%` : name === "revenue" ? `₹${Number(v).toLocaleString("en-IN")}` : v,
                  name === "occupancy_pct" ? "Occupancy" : name === "revenue" ? "Revenue" : "Sessions",
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="sessions" name="sessions" fill="#7c3aed" radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="occupancy_pct" name="occupancy_pct" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
