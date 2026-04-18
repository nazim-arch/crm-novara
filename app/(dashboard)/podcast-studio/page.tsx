import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Mic2, TrendingUp, Clock, Users, Calendar, BarChart2, DollarSign, Percent, Activity } from "lucide-react";
import {
  DAILY_CAPACITY_SLOTS, getOccupiedSlots, todayIST, getMonthBounds, dateRange, formatTimeDisplay,
} from "@/lib/podcast-studio";
import { PodcastDashboardCharts } from "@/components/podcast-studio/PodcastDashboardCharts";

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

type KPICardProps = {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: string;
};

function KPICard({ label, value, sub, icon, accent = "bg-violet-500/10 text-violet-600" }: KPICardProps) {
  return (
    <div className="bg-card border rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${accent}`}>{icon}</div>
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default async function PodcastStudioDashboardPage() {
  await auth();

  const today = todayIST();
  const currentMonth = today.slice(0, 7);
  const currentYear = today.slice(0, 4);

  const { start: monthStart, end: monthEnd } = getMonthBounds(currentMonth);
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31`;

  const [monthBookings, yearBookings] = await Promise.all([
    prisma.podcastStudioBooking.findMany({
      where: { booking_date: { gte: monthStart, lte: monthEnd }, status: { not: "Cancelled" } },
      select: {
        id: true, booking_date: true, start_time: true, duration_minutes: true,
        recording_value: true, editing_value: true, base_amount: true, gst_amount: true, total_revenue: true, status: true,
      },
    }),
    prisma.podcastStudioBooking.findMany({
      where: { booking_date: { gte: yearStart, lte: yearEnd }, status: { not: "Cancelled" } },
      select: {
        id: true, booking_date: true, start_time: true, duration_minutes: true,
        base_amount: true, gst_amount: true, total_revenue: true, status: true,
      },
    }),
  ]);

  const monthDays = dateRange(monthStart, monthEnd);
  const totalCapacity = monthDays.length * DAILY_CAPACITY_SLOTS;
  let occupiedSlots = 0;
  const slotFreq: Record<string, number> = {};
  for (const b of monthBookings) {
    const slots = getOccupiedSlots(b.start_time, b.duration_minutes);
    occupiedSlots += slots.length;
    for (const s of slots) slotFreq[s] = (slotFreq[s] ?? 0) + 1;
  }
  const occupancyPct = totalCapacity > 0 ? (occupiedSlots / totalCapacity) * 100 : 0;
  const monthHours = monthBookings.reduce((s, b) => s + b.duration_minutes, 0) / 60;
  const ytdHours = yearBookings.reduce((s, b) => s + b.duration_minutes, 0) / 60;
  const grossRev = monthBookings.reduce((s, b) => s + Number(b.total_revenue), 0);
  const gstAmt = monthBookings.reduce((s, b) => s + Number(b.gst_amount), 0);
  const baseRev = monthBookings.reduce((s, b) => s + Number(b.base_amount), 0);
  const avgVal = monthBookings.length > 0 ? grossRev / monthBookings.length : 0;
  const avgDuration = monthBookings.length > 0
    ? monthBookings.reduce((s, b) => s + b.duration_minutes, 0) / monthBookings.length : 0;
  const activeDays = new Set(monthBookings.map(b => b.booking_date)).size;
  const peakSlot = Object.entries(slotFreq).sort((a, b) => b[1] - a[1])[0]?.[0];

  // Charts data
  const dailyMap: Record<string, { sessions: number; hours: number; slots: number }> = {};
  for (const b of monthBookings) {
    if (!dailyMap[b.booking_date]) dailyMap[b.booking_date] = { sessions: 0, hours: 0, slots: 0 };
    dailyMap[b.booking_date].sessions += 1;
    dailyMap[b.booking_date].hours += b.duration_minutes / 60;
    dailyMap[b.booking_date].slots += getOccupiedSlots(b.start_time, b.duration_minutes).length;
  }
  const dailyData = monthDays.map(d => ({
    date: d.slice(5),
    sessions: dailyMap[d]?.sessions ?? 0,
    hours: +(dailyMap[d]?.hours ?? 0).toFixed(1),
    occupancy_pct: +((((dailyMap[d]?.slots ?? 0) / DAILY_CAPACITY_SLOTS) * 100).toFixed(1)),
  }));

  const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const weeklyMap: Record<string, { sessions: number; revenue: number }> = {};
  DOW.forEach(d => { weeklyMap[d] = { sessions: 0, revenue: 0 }; });
  for (const b of yearBookings) {
    const dow = DOW[new Date(b.booking_date + "T00:00:00").getDay()];
    weeklyMap[dow].sessions += 1;
    weeklyMap[dow].revenue += Number(b.total_revenue);
  }
  const weeklyData = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => ({
    day: d, sessions: weeklyMap[d].sessions, revenue: +weeklyMap[d].revenue.toFixed(0),
  }));

  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthlyPerf: Record<string, { sessions: number; revenue: number; slots: number }> = {};
  for (let m = 1; m <= 12; m++) {
    monthlyPerf[`${currentYear}-${String(m).padStart(2,"0")}`] = { sessions: 0, revenue: 0, slots: 0 };
  }
  for (const b of yearBookings) {
    const key = b.booking_date.slice(0, 7);
    if (!monthlyPerf[key]) continue;
    monthlyPerf[key].sessions += 1;
    monthlyPerf[key].revenue += Number(b.total_revenue);
    monthlyPerf[key].slots += getOccupiedSlots(b.start_time, b.duration_minutes).length;
  }
  const monthlyData = Object.entries(monthlyPerf).map(([key, v]) => {
    const m = Number(key.split("-")[1]);
    const days = new Date(Number(currentYear), m, 0).getDate();
    const cap = days * DAILY_CAPACITY_SLOTS;
    return {
      month: MONTH_NAMES[m - 1],
      sessions: v.sessions,
      revenue: +v.revenue.toFixed(0),
      occupancy_pct: cap > 0 ? +((v.slots / cap) * 100).toFixed(1) : 0,
    };
  });

  const recRev = monthBookings.reduce((s, b) => s + Number(b.recording_value ?? 0), 0);
  const editRev = monthBookings.reduce((s, b) => s + Number(b.editing_value ?? 0), 0);
  const revBreakdown = [
    { name: "Recording", value: +recRev.toFixed(0), fill: "#7c3aed" },
    { name: "Editing", value: +editRev.toFixed(0), fill: "#0ea5e9" },
    { name: "GST", value: +gstAmt.toFixed(0), fill: "#f59e0b" },
  ];

  const peakHoursData = Object.entries(slotFreq)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([slot, count]) => ({
      slot: formatTimeDisplay(slot),
      bookings: count,
      demand: +((count / Math.max(...Object.values(slotFreq), 1)) * 100).toFixed(0),
    }));

  const chartData = { dailyData, weeklyData, monthlyData, revBreakdown, peakHoursData };
  const MONTH_DISPLAY = new Date(monthStart + "T00:00:00").toLocaleString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-violet-600 text-white flex items-center justify-center">
            <Mic2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Podcast Studio</h1>
            <p className="text-sm text-muted-foreground">{MONTH_DISPLAY} · Executive Dashboard</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" render={<Link href="/podcast-studio/calendar" />}>
            View Calendar
          </Button>
          <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" render={<Link href="/podcast-studio/bookings/new" />}>
            <Plus className="h-4 w-4 mr-1.5" /> New Booking
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard label="Occupancy % (MTD)" value={`${occupancyPct.toFixed(1)}%`} sub={`${occupiedSlots} / ${totalCapacity} slots`} icon={<Percent className="h-4 w-4" />} accent="bg-violet-500/10 text-violet-600" />
        <KPICard label="Hours Booked" value={monthHours.toFixed(1)} sub={`YTD: ${ytdHours.toFixed(1)} hrs`} icon={<Clock className="h-4 w-4" />} accent="bg-blue-500/10 text-blue-600" />
        <KPICard label="Total Sessions" value={String(monthBookings.length)} sub={`${activeDays} active days`} icon={<Users className="h-4 w-4" />} accent="bg-emerald-500/10 text-emerald-600" />
        <KPICard label="Active Booking Days" value={String(activeDays)} sub={`of ${monthDays.length} days`} icon={<Calendar className="h-4 w-4" />} accent="bg-amber-500/10 text-amber-600" />
        <KPICard label="Peak Time Slot" value={peakSlot ? formatTimeDisplay(peakSlot) : "—"} sub={peakSlot ? `${slotFreq[peakSlot]} bookings` : "No data yet"} icon={<TrendingUp className="h-4 w-4" />} accent="bg-rose-500/10 text-rose-600" />
        <KPICard label="Avg Session Duration" value={avgDuration > 0 ? `${Math.round(avgDuration)} min` : "—"} sub={avgDuration > 0 ? `${(avgDuration / 60).toFixed(1)} hrs` : undefined} icon={<Activity className="h-4 w-4" />} accent="bg-cyan-500/10 text-cyan-600" />
        <KPICard label="Gross Revenue" value={formatINR(grossRev)} sub="incl. GST" icon={<DollarSign className="h-4 w-4" />} accent="bg-violet-500/10 text-violet-600" />
        <KPICard label="GST Collected" value={formatINR(gstAmt)} sub="this month" icon={<BarChart2 className="h-4 w-4" />} accent="bg-amber-500/10 text-amber-600" />
        <KPICard label="Net Base Revenue" value={formatINR(baseRev)} sub="before GST" icon={<DollarSign className="h-4 w-4" />} accent="bg-emerald-500/10 text-emerald-600" />
        <KPICard label="Avg Booking Value" value={formatINR(avgVal)} sub="per session" icon={<TrendingUp className="h-4 w-4" />} accent="bg-blue-500/10 text-blue-600" />
      </div>

      <PodcastDashboardCharts data={chartData} />
    </div>
  );
}
