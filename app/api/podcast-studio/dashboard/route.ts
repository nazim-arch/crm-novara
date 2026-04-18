import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { NextResponse } from "next/server";
import {
  DAILY_CAPACITY_SLOTS, getOccupiedSlots, todayIST, getMonthBounds, dateRange,
} from "@/lib/podcast-studio";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "podcast_studio:manage"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const today = todayIST();
    const yearParam = searchParams.get("year") ?? today.slice(0, 4);
    const monthParam = searchParams.get("month") ?? today.slice(0, 7); // "YYYY-MM"

    const { start: monthStart, end: monthEnd } = getMonthBounds(monthParam);
    const yearStart = `${yearParam}-01-01`;
    const yearEnd = `${yearParam}-12-31`;

    // Fetch all active bookings for the year
    const [monthBookings, yearBookings] = await Promise.all([
      prisma.podcastStudioBooking.findMany({
        where: { booking_date: { gte: monthStart, lte: monthEnd }, status: { not: "Cancelled" } },
        select: {
          id: true, booking_date: true, start_time: true, end_time: true,
          duration_minutes: true, client_name: true, recording_value: true,
          editing_value: true, base_amount: true, gst_amount: true, total_revenue: true,
          gst_percent: true, status: true,
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

    // ── Month KPIs ────────────────────────────────────────────────────────────
    const monthDays = dateRange(monthStart, monthEnd);
    const activeDays = new Set(monthBookings.map(b => b.booking_date));
    const totalMonthSlots = monthDays.length * DAILY_CAPACITY_SLOTS;

    let monthOccupiedSlots = 0;
    const slotFrequency: Record<string, number> = {};
    for (const b of monthBookings) {
      const slots = getOccupiedSlots(b.start_time, b.duration_minutes);
      monthOccupiedSlots += slots.length;
      for (const s of slots) slotFrequency[s] = (slotFrequency[s] ?? 0) + 1;
    }

    const occupancyPct = totalMonthSlots > 0 ? (monthOccupiedSlots / totalMonthSlots) * 100 : 0;
    const monthHours = monthBookings.reduce((s, b) => s + b.duration_minutes, 0) / 60;
    const grossRevenue = monthBookings.reduce((s, b) => s + Number(b.total_revenue), 0);
    const gstCollected = monthBookings.reduce((s, b) => s + Number(b.gst_amount), 0);
    const baseRevenue = monthBookings.reduce((s, b) => s + Number(b.base_amount), 0);
    const avgBookingValue = monthBookings.length > 0 ? grossRevenue / monthBookings.length : 0;
    const avgSessionDuration = monthBookings.length > 0
      ? monthBookings.reduce((s, b) => s + b.duration_minutes, 0) / monthBookings.length
      : 0;
    const peakSlot = Object.entries(slotFrequency).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    // ── YTD KPIs ──────────────────────────────────────────────────────────────
    const ytdHours = yearBookings.reduce((s, b) => s + b.duration_minutes, 0) / 60;
    const ytdRevenue = yearBookings.reduce((s, b) => s + Number(b.total_revenue), 0);

    // ── Daily utilisation (current month) ────────────────────────────────────
    const dailyMap: Record<string, { sessions: number; hours: number; slots: number }> = {};
    for (const b of monthBookings) {
      if (!dailyMap[b.booking_date]) dailyMap[b.booking_date] = { sessions: 0, hours: 0, slots: 0 };
      dailyMap[b.booking_date].sessions += 1;
      dailyMap[b.booking_date].hours += b.duration_minutes / 60;
      dailyMap[b.booking_date].slots += getOccupiedSlots(b.start_time, b.duration_minutes).length;
    }
    const dailyUtilisation = monthDays.map(date => ({
      date,
      sessions: dailyMap[date]?.sessions ?? 0,
      hours: +(dailyMap[date]?.hours ?? 0).toFixed(2),
      slots: dailyMap[date]?.slots ?? 0,
      occupancy_pct: +((((dailyMap[date]?.slots ?? 0) / DAILY_CAPACITY_SLOTS) * 100).toFixed(1)),
    }));

    // ── Weekly booking pattern ────────────────────────────────────────────────
    const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weeklyMap: Record<string, { sessions: number; hours: number; slots: number; revenue: number }> = {};
    DOW.forEach(d => { weeklyMap[d] = { sessions: 0, hours: 0, slots: 0, revenue: 0 }; });
    for (const b of yearBookings) {
      const dow = DOW[new Date(b.booking_date + "T00:00:00").getDay()];
      weeklyMap[dow].sessions += 1;
      weeklyMap[dow].hours += b.duration_minutes / 60;
      weeklyMap[dow].slots += getOccupiedSlots("10:00", b.duration_minutes).length; // simplified
      weeklyMap[dow].revenue += Number(b.total_revenue);
    }
    const weeklyPattern = DOW.slice(1).concat(DOW[0]).map(d => ({
      day: d, ...weeklyMap[d],
      hours: +weeklyMap[d].hours.toFixed(2),
      occupancy_pct: +((weeklyMap[d].slots / DAILY_CAPACITY_SLOTS * 100).toFixed(1)),
    }));

    // ── Peak hours analysis ───────────────────────────────────────────────────
    const peakHoursAnalysis = Object.entries(slotFrequency)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([slot, count]) => ({
        slot,
        days_booked: count,
        demand_index: +((count / Math.max(...Object.values(slotFrequency))) * 100).toFixed(0),
      }));

    // ── Monthly performance overview (all 12 months of the year) ─────────────
    const monthlyPerf: Record<string, { sessions: number; duration: number; slots: number; revenue: number; days: Set<string> }> = {};
    for (let m = 1; m <= 12; m++) {
      const key = `${yearParam}-${String(m).padStart(2, "0")}`;
      monthlyPerf[key] = { sessions: 0, duration: 0, slots: 0, revenue: 0, days: new Set() };
    }
    for (const b of yearBookings) {
      const key = b.booking_date.slice(0, 7);
      if (!monthlyPerf[key]) continue;
      monthlyPerf[key].sessions += 1;
      monthlyPerf[key].duration += b.duration_minutes;
      monthlyPerf[key].slots += getOccupiedSlots("10:00", b.duration_minutes).length;
      monthlyPerf[key].revenue += Number(b.total_revenue);
      monthlyPerf[key].days.add(b.booking_date);
    }
    const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const monthlyOverview = Object.entries(monthlyPerf).map(([key, v]) => {
      const m = Number(key.split("-")[1]);
      const daysInMonth = new Date(Number(yearParam), m, 0).getDate();
      const capacity = daysInMonth * DAILY_CAPACITY_SLOTS;
      return {
        month: MONTH_NAMES[m - 1],
        month_key: key,
        sessions: v.sessions,
        hours: +(v.duration / 60).toFixed(1),
        slots: v.slots,
        capacity,
        occupancy_pct: capacity > 0 ? +((v.slots / capacity) * 100).toFixed(1) : 0,
        avg_session_mins: v.sessions > 0 ? +(v.duration / v.sessions).toFixed(0) : 0,
        active_days: v.days.size,
        revenue: +v.revenue.toFixed(2),
      };
    });

    // ── Revenue breakdown ─────────────────────────────────────────────────────
    const recordingRevenue = monthBookings.reduce((s, b) => s + Number(b.recording_value ?? 0), 0);
    const editingRevenue = monthBookings.reduce((s, b) => s + Number(b.editing_value ?? 0), 0);

    return NextResponse.json({
      kpis: {
        occupancy_pct: +occupancyPct.toFixed(1),
        month_hours_booked: +monthHours.toFixed(1),
        ytd_hours_booked: +ytdHours.toFixed(1),
        total_sessions: monthBookings.length,
        active_booking_days: activeDays.size,
        peak_time_slot: peakSlot,
        avg_session_duration_mins: +avgSessionDuration.toFixed(0),
        gross_revenue: +grossRevenue.toFixed(2),
        gst_collected: +gstCollected.toFixed(2),
        net_base_revenue: +baseRevenue.toFixed(2),
        avg_booking_value: +avgBookingValue.toFixed(2),
        ytd_revenue: +ytdRevenue.toFixed(2),
      },
      charts: {
        daily_utilisation: dailyUtilisation,
        weekly_pattern: weeklyPattern,
        peak_hours: peakHoursAnalysis,
        monthly_overview: monthlyOverview,
        revenue_breakdown: {
          recording: +recordingRevenue.toFixed(2),
          editing: +editingRevenue.toFixed(2),
          gst: +gstCollected.toFixed(2),
          total: +grossRevenue.toFixed(2),
        },
      },
    });
  } catch (error) {
    console.error("GET /api/podcast-studio/dashboard:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
