"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, X, Clock, User, Phone } from "lucide-react";
import {
  STUDIO_SLOTS, DAILY_CAPACITY_SLOTS, formatTimeDisplay, formatDateDisplay, getDayName,
  getWeekBounds, dateRange, getMonthBounds, todayIST, getOccupiedSlots, isWeekend,
} from "@/lib/podcast-studio";

type Booking = {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  client_name: string;
  phone?: string | null;
  status: string;
  total_revenue?: number | string;
  base_amount?: number | string;
};

type SlotAvailability = Record<string, {
  date: string;
  total_slots: number;
  occupied_slots: number;
  free_slots: number;
  occupancy_pct: number;
  bookings: Booking[];
  slot_status: Record<string, "free" | "booked">;
}>;

type ViewType = "day" | "week" | "month";

const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function SlotCalendar() {
  const router = useRouter();
  const today = todayIST();
  const [view, setView] = useState<ViewType>("week");
  const [currentDate, setCurrentDate] = useState(today);
  const [availability, setAvailability] = useState<SlotAvailability>({});
  const [loading, setLoading] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const fetchAvailability = useCallback(async (start: string, end: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/podcast-studio/slots?start_date=${start}&end_date=${end}`);
      if (res.ok) {
        const json = await res.json();
        setAvailability(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "day") {
      fetchAvailability(currentDate, currentDate);
    } else if (view === "week") {
      const { start, end } = getWeekBounds(currentDate);
      fetchAvailability(start, end);
    } else {
      const month = currentDate.slice(0, 7);
      const { start, end } = getMonthBounds(month);
      fetchAvailability(start, end);
    }
  }, [view, currentDate, fetchAvailability]);

  function navigate(dir: -1 | 1) {
    const d = new Date(currentDate + "T00:00:00");
    if (view === "day") d.setDate(d.getDate() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCurrentDate(d.toISOString().slice(0, 10));
  }

  function getBookingForSlot(date: string, slot: string): Booking | undefined {
    const dayData = availability[date];
    if (!dayData) return undefined;
    return dayData.bookings.find(b => {
      if (b.status === "Cancelled") return false;
      const occupied = getOccupiedSlots(b.start_time, b.duration_minutes);
      return occupied.includes(slot);
    });
  }

  function isSlotStart(booking: Booking, slot: string): boolean {
    return booking.start_time === slot;
  }

  function getSlotSpan(booking: Booking): number {
    return Math.ceil(booking.duration_minutes / 30);
  }

  // ── Day View ─────────────────────────────────────────────────────────────────
  function DayView() {
    const dayData = availability[currentDate];
    const renderedBookings = new Set<string>();

    return (
      <div className="overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-base">{DOW_FULL[new Date(currentDate + "T00:00:00").getDay()]}</p>
            <p className="text-sm text-muted-foreground">{formatDateDisplay(currentDate)}</p>
          </div>
          <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" onClick={() => router.push(`/podcast-studio/bookings/new?date=${currentDate}`)}>
            <Plus className="h-4 w-4 mr-1" /> Quick Add
          </Button>
        </div>
        <div className="border rounded-lg overflow-hidden">
          {STUDIO_SLOTS.map((slot) => {
            const booking = getBookingForSlot(currentDate, slot);
            const isStart = booking ? isSlotStart(booking, slot) : false;
            const alreadyRendered = booking && renderedBookings.has(booking.id);
            if (booking && isStart) renderedBookings.add(booking.id);

            if (booking && !isStart && alreadyRendered) return null;
            if (booking && !isStart) return null;

            return (
              <div key={slot} className="flex border-b last:border-0">
                <div className="w-20 shrink-0 px-3 py-2.5 text-xs text-muted-foreground font-mono border-r bg-muted/30">
                  {formatTimeDisplay(slot)}
                </div>
                {booking ? (
                  <div
                    className="flex-1 p-2.5 bg-violet-50 border-l-4 border-l-violet-500 cursor-pointer hover:bg-violet-100 transition-colors"
                    style={{ minHeight: `${getSlotSpan(booking) * 48}px` }}
                    onClick={() => setSelectedBooking(booking)}
                  >
                    <p className="text-sm font-semibold text-violet-900">{booking.client_name}</p>
                    <p className="text-xs text-violet-700">{formatTimeDisplay(booking.start_time)} – {formatTimeDisplay(booking.end_time)} · {booking.duration_minutes} min</p>
                  </div>
                ) : (
                  <div
                    className="flex-1 py-2.5 px-3 text-xs text-muted-foreground/40 hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => router.push(`/podcast-studio/bookings/new?date=${currentDate}&time=${slot}`)}
                  >
                    Available
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {dayData && (
          <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
            <span>{dayData.occupied_slots} / {DAILY_CAPACITY_SLOTS} slots booked</span>
            <span>·</span>
            <span>{dayData.occupancy_pct}% occupancy</span>
            <span>·</span>
            <span>{dayData.bookings.filter(b => b.status !== "Cancelled").length} sessions</span>
          </div>
        )}
      </div>
    );
  }

  // ── Week View ────────────────────────────────────────────────────────────────
  function WeekView() {
    const { start, end } = getWeekBounds(currentDate);
    const weekDates = dateRange(start, end);
    const renderedBookings = new Set<string>();

    return (
      <div className="overflow-auto">
        <div className="inline-block min-w-full">
          {/* Header row */}
          <div className="flex border-b bg-muted/30 sticky top-0 z-10">
            <div className="w-20 shrink-0 border-r px-2 py-2.5" />
            {weekDates.map(date => {
              const occ = availability[date];
              const isToday = date === today;
              return (
                <div key={date} className={cn("flex-1 min-w-[110px] px-2 py-2 border-r last:border-0 text-center", isToday && "bg-violet-50")}>
                  <p className={cn("text-xs font-semibold", isToday ? "text-violet-600" : "text-muted-foreground")}>
                    {getDayName(date)}
                  </p>
                  <p className={cn("text-sm font-bold", isToday ? "text-violet-700" : "")}>{date.slice(8)}</p>
                  {occ ? (
                    <div className="mt-1">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-violet-500 transition-all"
                          style={{ width: `${occ.occupancy_pct}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{occ.occupancy_pct}%</p>
                    </div>
                  ) : (
                    <div className="mt-1 h-4" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Slot rows */}
          {STUDIO_SLOTS.map((slot) => (
            <div key={slot} className="flex border-b last:border-0 min-h-[44px]">
              <div className="w-20 shrink-0 px-2 py-2 text-[11px] text-muted-foreground font-mono border-r bg-muted/10 flex items-start pt-2.5">
                {formatTimeDisplay(slot)}
              </div>
              {weekDates.map(date => {
                const booking = getBookingForSlot(date, slot);
                const isStart = booking ? isSlotStart(booking, slot) : false;
                const isOccupied = !!booking;
                const alreadyRendered = booking && renderedBookings.has(`${date}-${booking.id}`);

                if (booking && isStart) renderedBookings.add(`${date}-${booking.id}`);
                if (isOccupied && !isStart) {
                  // Show a "continuation" cell
                  return <div key={date} className="flex-1 min-w-[110px] border-r last:border-0 bg-violet-50/60" />;
                }

                return (
                  <div
                    key={date}
                    className={cn(
                      "flex-1 min-w-[110px] border-r last:border-0 relative",
                      date === today && !isOccupied && "bg-violet-50/30"
                    )}
                  >
                    {booking && isStart && !alreadyRendered ? (
                      <div
                        className="absolute inset-x-0 top-0 mx-0.5 rounded bg-violet-500 text-white text-[10px] p-1 cursor-pointer hover:bg-violet-600 transition-colors z-10 overflow-hidden"
                        style={{ height: `${getSlotSpan(booking) * 44 - 2}px`, top: "1px" }}
                        onClick={() => setSelectedBooking(booking)}
                      >
                        <p className="font-semibold truncate leading-tight">{booking.client_name}</p>
                        <p className="opacity-80 leading-tight">{formatTimeDisplay(booking.start_time)}</p>
                      </div>
                    ) : !isOccupied ? (
                      <div
                        className="w-full h-full min-h-[44px] cursor-pointer hover:bg-violet-50 transition-colors"
                        onClick={() => router.push(`/podcast-studio/bookings/new?date=${date}&time=${slot}`)}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Month View ───────────────────────────────────────────────────────────────
  function MonthView() {
    const month = currentDate.slice(0, 7);
    const { start, end } = getMonthBounds(month);
    const allDates = dateRange(start, end);
    const firstDow = new Date(start + "T00:00:00").getDay();
    const leadingBlanks = Array(firstDow).fill(null);

    function getOccupancyColor(pct: number) {
      if (pct === 0) return "bg-card";
      if (pct < 25) return "bg-violet-50";
      if (pct < 50) return "bg-violet-100";
      if (pct < 75) return "bg-violet-200";
      return "bg-violet-300";
    }

    return (
      <div>
        <div className="grid grid-cols-7 mb-1">
          {DOW_SHORT.map(d => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {leadingBlanks.map((_, i) => <div key={`b-${i}`} className="aspect-square" />)}
          {allDates.map(date => {
            const occ = availability[date];
            const isToday = date === today;
            const pct = occ?.occupancy_pct ?? 0;
            const sessions = occ?.bookings.filter(b => b.status !== "Cancelled").length ?? 0;

            return (
              <div
                key={date}
                className={cn(
                  "border rounded-lg p-1.5 sm:p-2 cursor-pointer hover:ring-2 hover:ring-violet-400 transition-all",
                  getOccupancyColor(pct),
                  isToday && "ring-2 ring-violet-500",
                  isWeekend(date) && "opacity-60",
                )}
                onClick={() => { setCurrentDate(date); setView("day"); }}
              >
                <p className={cn("text-xs font-bold", isToday ? "text-violet-700" : "text-foreground")}>{date.slice(8)}</p>
                {sessions > 0 ? (
                  <>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{sessions} sessions</p>
                    <p className="text-[10px] font-semibold text-violet-700">{pct}%</p>
                  </>
                ) : (
                  <p className="text-[10px] text-muted-foreground/40 mt-0.5">Free</p>
                )}
              </div>
            );
          })}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-card border" />Free</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-violet-100" />25%</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-violet-200" />50%</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-violet-300" />75%+</span>
        </div>
      </div>
    );
  }

  // Header label based on view
  function getHeaderLabel() {
    if (view === "day") return `${getDayName(currentDate)}, ${formatDateDisplay(currentDate)}`;
    if (view === "week") {
      const { start, end } = getWeekBounds(currentDate);
      return `${formatDateDisplay(start)} – ${formatDateDisplay(end)}`;
    }
    const [y, m] = currentDate.split("-").map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[200px] text-center">{getHeaderLabel()}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setCurrentDate(today)}>
            Today
          </Button>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(["day", "week", "month"] as ViewType[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize",
                view === v ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar body */}
      <div className="bg-card border rounded-xl p-4 relative">
        {loading && (
          <div className="absolute inset-0 bg-background/60 rounded-xl flex items-center justify-center z-20">
            <div className="text-sm text-muted-foreground">Loading…</div>
          </div>
        )}
        {view === "day" && <DayView />}
        {view === "week" && <WeekView />}
        {view === "month" && <MonthView />}
      </div>

      {/* Booking detail drawer */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setSelectedBooking(null)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-background border-l shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">Booking Details</h3>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedBooking(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-5">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Client</p>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <p className="font-semibold">{selectedBooking.client_name}</p>
                </div>
                {selectedBooking.phone && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm">{selectedBooking.phone}</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Date</p>
                  <p className="text-sm font-medium">{formatDateDisplay(selectedBooking.booking_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Duration</p>
                  <p className="text-sm font-medium">{selectedBooking.duration_minutes} min</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Start</p>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium">{formatTimeDisplay(selectedBooking.start_time)}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">End</p>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium">{formatTimeDisplay(selectedBooking.end_time)}</p>
                  </div>
                </div>
              </div>
              {(selectedBooking.total_revenue || selectedBooking.base_amount) && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Revenue</p>
                  <div className="bg-violet-50 rounded-lg p-3 space-y-1">
                    {selectedBooking.base_amount && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Base</span>
                        <span>₹{Number(selectedBooking.base_amount).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {selectedBooking.total_revenue && (
                      <div className="flex justify-between text-sm font-semibold border-t pt-1 mt-1">
                        <span>Total</span>
                        <span className="text-violet-700">₹{Number(selectedBooking.total_revenue).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <span className={cn(
                  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                  selectedBooking.status === "Confirmed" && "bg-emerald-100 text-emerald-700",
                  selectedBooking.status === "Cancelled" && "bg-red-100 text-red-700",
                  selectedBooking.status === "Completed" && "bg-blue-100 text-blue-700",
                )}>
                  {selectedBooking.status}
                </span>
              </div>
            </div>
            <div className="p-4 border-t flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => { router.push(`/podcast-studio/bookings/${selectedBooking.id}/edit`); setSelectedBooking(null); }}>
                Edit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
