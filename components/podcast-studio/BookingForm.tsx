"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Loader2, AlertCircle, CheckCircle2, Clock, DollarSign, Calendar, User, Wand2, RefreshCw } from "lucide-react";
import {
  STUDIO_SLOTS, DURATION_OPTIONS, formatTimeDisplay, formatDuration,
  addMinutesToTime, timeToMinutes, STUDIO_CLOSE,
} from "@/lib/podcast-studio";

const BOOKING_TYPES = ["One-time", "Recurring"] as const;
const SEATER_TYPES = ["1-Seater", "2-Seater", "3-Seater", "4-Seater"] as const;

const schema = z.object({
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Required"),
  start_time: z.string().min(1, "Required"),
  duration_minutes: z.number().int().min(30).refine(v => v % 30 === 0, "Must be a 30-min multiple"),
  booking_type: z.enum(BOOKING_TYPES),
  seater_type: z.enum(SEATER_TYPES).optional(),
  client_name: z.string().min(1, "Required"),
  phone: z.string().max(20).optional(),
  notes: z.string().max(2000).optional(),
  recording_hours: z.number().min(0).optional(),
  recording_value: z.number().min(0).optional(),
  editing_hours: z.number().min(0).optional(),
  editing_value: z.number().min(0).optional(),
  gst_percent: z.number().min(0).max(100),
  status: z.enum(["Confirmed", "Cancelled", "Completed"]),
});

type FormData = z.infer<typeof schema>;

type Rate = { seater_type: string; recording_rate_per_hour: number; editing_rate_per_hour: number };

type ExistingBooking = {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  booking_type: string;
  seater_type?: string | null;
  client_name: string;
  phone?: string | null;
  notes?: string | null;
  recording_hours?: number | null;
  recording_value?: number | null;
  editing_hours?: number | null;
  editing_value?: number | null;
  gst_percent: number;
  base_amount: number;
  gst_amount: number;
  total_revenue: number;
  status: "Confirmed" | "Cancelled" | "Completed";
};

interface BookingFormProps {
  defaultDate?: string;
  defaultTime?: string;
  editBooking?: ExistingBooking;
}

export function BookingForm({ defaultDate, defaultTime, editBooking }: BookingFormProps) {
  const router = useRouter();
  const isEdit = !!editBooking;

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: editBooking ? {
      booking_date: editBooking.booking_date,
      start_time: editBooking.start_time,
      duration_minutes: editBooking.duration_minutes,
      booking_type: (BOOKING_TYPES.includes(editBooking.booking_type as typeof BOOKING_TYPES[number]) ? editBooking.booking_type : "One-time") as typeof BOOKING_TYPES[number],
      seater_type: (editBooking.seater_type && SEATER_TYPES.includes(editBooking.seater_type as typeof SEATER_TYPES[number]) ? editBooking.seater_type : undefined) as typeof SEATER_TYPES[number] | undefined,
      client_name: editBooking.client_name,
      phone: editBooking.phone ?? "",
      notes: editBooking.notes ?? "",
      recording_hours: editBooking.recording_hours ?? undefined,
      recording_value: editBooking.recording_value ?? undefined,
      editing_hours: editBooking.editing_hours ?? undefined,
      editing_value: editBooking.editing_value ?? undefined,
      gst_percent: editBooking.gst_percent,
      status: editBooking.status,
    } : {
      booking_date: defaultDate ?? "",
      start_time: defaultTime ?? "",
      duration_minutes: 60,
      booking_type: "One-time" as const,
      gst_percent: 18,
      status: "Confirmed" as const,
    },
  });

  const [rates, setRates] = useState<Rate[]>([]);
  const [submitError, setSubmitError] = useState("");
  const [availabilityMsg, setAvailabilityMsg] = useState<{ type: "ok" | "conflict" | "loading"; msg: string } | null>(null);

  // Recurring state
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [recurringUntil, setRecurringUntil] = useState("");
  const [recurringFreq, setRecurringFreq] = useState<"weekly" | "biweekly" | "monthly" | "custom">("weekly");
  const [recurringProgress, setRecurringProgress] = useState<{ done: number; total: number; created: number; conflicts: number } | null>(null);
  const [customDates, setCustomDates] = useState<string[]>([]);
  const [customDateInput, setCustomDateInput] = useState("");

  function generateRecurringDates(
    startDate: string,
    selectedDays: number[],
    until: string,
    freq: "weekly" | "biweekly" | "monthly" | "custom",
    custom: string[] = [],
  ): string[] {
    if (freq === "custom") return [...custom].sort();
    if (!startDate || !until) return [];
    if (freq === "monthly") {
      const dates: string[] = [];
      const end = new Date(until + "T00:00:00");
      const d = new Date(startDate + "T00:00:00");
      while (d <= end) {
        dates.push(d.toISOString().split("T")[0]);
        d.setMonth(d.getMonth() + 1);
      }
      return dates;
    }
    if (selectedDays.length === 0) return [];
    const dates = new Set<string>();
    const step = freq === "biweekly" ? 14 : 7;
    const end = new Date(until + "T00:00:00");
    const start = new Date(startDate + "T00:00:00");
    for (const targetDay of selectedDays) {
      const d = new Date(start);
      while (d.getDay() !== targetDay) d.setDate(d.getDate() + 1);
      while (d <= end) {
        dates.add(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + step);
      }
    }
    return [...dates].sort();
  }

  // Load rates once
  useEffect(() => {
    fetch("/api/podcast-studio/rates")
      .then(r => r.json())
      .then(j => { if (j.data) setRates(j.data); })
      .catch(() => {});
  }, []);

  const watchDate = watch("booking_date");
  const watchTime = watch("start_time");
  const watchDuration = watch("duration_minutes");
  const watchRecHours = watch("recording_hours") ?? 0;
  const watchEditHours = watch("editing_hours") ?? 0;
  const watchRecValue = watch("recording_value") ?? 0;
  const watchEditValue = watch("editing_value") ?? 0;
  const watchGst = watch("gst_percent") ?? 18;
  const watchSeater = watch("seater_type");
  const watchBookingType = watch("booking_type");

  const base = Number(watchRecValue) + Number(watchEditValue);
  const gstAmt = (base * Number(watchGst)) / 100;
  const total = base + gstAmt;
  const endTime = watchTime && watchDuration ? addMinutesToTime(watchTime, Number(watchDuration)) : null;
  const endExceedsClose = endTime ? timeToMinutes(endTime) > timeToMinutes(STUDIO_CLOSE) : false;

  // Active rate for selected seater
  const activeRate = rates.find(r => r.seater_type === watchSeater);
  const suggestedRecValue = activeRate && Number(watchRecHours) > 0
    ? activeRate.recording_rate_per_hour * Number(watchRecHours)
    : null;
  const suggestedEditValue = activeRate && Number(watchEditHours) > 0
    ? activeRate.editing_rate_per_hour * Number(watchEditHours)
    : null;

  // Auto-select day of week + default until when switching to Recurring
  useEffect(() => {
    if (watchBookingType === "Recurring" && watchDate) {
      const day = new Date(watchDate + "T00:00:00").getDay();
      setRecurringDays(prev => prev.length === 0 ? [day] : prev);
      setRecurringUntil(prev => {
        if (prev) return prev;
        const d = new Date(watchDate + "T00:00:00");
        d.setDate(d.getDate() + 28);
        return d.toISOString().split("T")[0];
      });
    }
  }, [watchDate, watchBookingType]);

  // Availability check
  useEffect(() => {
    if (!watchDate || !watchTime || !watchDuration) { setAvailabilityMsg(null); return; }
    if (!STUDIO_SLOTS.includes(watchTime)) { setAvailabilityMsg(null); return; }
    if (endExceedsClose) {
      setAvailabilityMsg({ type: "conflict", msg: `Ends at ${endTime} — exceeds 8:30 PM studio close` });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setAvailabilityMsg({ type: "loading", msg: "Checking availability…" });
      try {
        const res = await fetch(`/api/podcast-studio/slots?start_date=${watchDate}&end_date=${watchDate}`, { signal: controller.signal });
        if (!res.ok) return;
        const json = await res.json();
        const day = json.data?.[watchDate];
        if (!day || !endTime) return;
        const newStart = timeToMinutes(watchTime);
        const newEnd = timeToMinutes(endTime);
        type DayBooking = { id: string; start_time: string; end_time: string; status: string; client_name: string };
        const conflict = (day.bookings as DayBooking[]).find(b => {
          if (b.status === "Cancelled") return false;
          if (isEdit && b.id === editBooking?.id) return false;
          return newStart < timeToMinutes(b.end_time) && newEnd > timeToMinutes(b.start_time);
        });
        setAvailabilityMsg(conflict
          ? { type: "conflict", msg: `Conflicts with ${conflict.client_name} (${conflict.start_time}–${conflict.end_time})` }
          : { type: "ok", msg: "Slot is available" }
        );
      } catch { /* aborted */ }
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [watchDate, watchTime, watchDuration, endTime, endExceedsClose, isEdit, editBooking?.id]);

  async function onSubmit(data: FormData) {
    setSubmitError("");

    // Recurring: create one booking per generated date
    if (data.booking_type === "Recurring" && !isEdit) {
      const dates = generateRecurringDates(data.booking_date, recurringDays, recurringUntil, recurringFreq, customDates);
      if (dates.length === 0) {
        setSubmitError("No dates generated. Select at least one day and an end date.");
        return;
      }
      setRecurringProgress({ done: 0, total: dates.length, created: 0, conflicts: 0 });
      let created = 0, conflicts = 0;
      for (const date of dates) {
        try {
          const res = await fetch("/api/podcast-studio/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...data, booking_date: date }),
          });
          if (res.ok) created++; else conflicts++;
        } catch { conflicts++; }
        setRecurringProgress(p => p ? { ...p, done: p.done + 1, created, conflicts } : null);
      }
      router.push(`/podcast-studio/bookings?created=${created}&skipped=${conflicts}`);
      router.refresh();
      return;
    }

    try {
      const url = isEdit ? `/api/podcast-studio/bookings/${editBooking!.id}` : "/api/podcast-studio/bookings";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) { setSubmitError(json.error ?? "Failed to save booking"); return; }
      router.push("/podcast-studio/bookings");
      router.refresh();
    } catch {
      setSubmitError("Network error. Please try again.");
    }
  }

  async function onSubmitAndNew(data: FormData) {
    setSubmitError("");
    try {
      const res = await fetch("/api/podcast-studio/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) { setSubmitError(json.error ?? "Failed to save booking"); return; }
      router.push("/podcast-studio/bookings/new");
      router.refresh();
    } catch {
      setSubmitError("Network error. Please try again.");
    }
  }

  function SectionTitle({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
    return (
      <div className="flex items-center gap-3 mb-5">
        <div className="h-8 w-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">{icon}</div>
        <div>
          <p className="font-semibold text-sm">{title}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <form onSubmit={handleSubmit(onSubmit)} className="lg:col-span-2 space-y-6">

        {/* Section A: Booking Details */}
        <div className="bg-card border rounded-xl p-6">
          <SectionTitle icon={<Calendar className="h-4 w-4" />} title="Booking Details" sub="Date, time, type, and client" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Booking Date */}
            <div className="space-y-1.5">
              <Label htmlFor="booking_date">Booking Date <span className="text-destructive">*</span></Label>
              <Input id="booking_date" type="date" {...register("booking_date")} />
              {errors.booking_date && <p className="text-xs text-destructive">{errors.booking_date.message}</p>}
            </div>

            {/* Start Time */}
            <div className="space-y-1.5">
              <Label>Start Time <span className="text-destructive">*</span></Label>
              <Select value={watchTime || ""} onValueChange={v => v && setValue("start_time", v)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select start time…" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {STUDIO_SLOTS.map(slot => <SelectItem key={slot} value={slot}>{formatTimeDisplay(slot)}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.start_time && <p className="text-xs text-destructive">{errors.start_time.message}</p>}
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <Label>Duration <span className="text-destructive">*</span></Label>
              <Select value={String(watchDuration || "")} onValueChange={v => v && setValue("duration_minutes", Number(v))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select duration…" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {DURATION_OPTIONS.map(d => {
                    if (watchTime) { const et = addMinutesToTime(watchTime, d); if (timeToMinutes(et) > timeToMinutes(STUDIO_CLOSE)) return null; }
                    return (
                      <SelectItem key={d} value={String(d)}>
                        {formatDuration(d)}{watchTime ? ` → ${formatTimeDisplay(addMinutesToTime(watchTime, d))}` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {errors.duration_minutes && <p className="text-xs text-destructive">{errors.duration_minutes.message}</p>}
            </div>

            {/* Booking Type */}
            <div className="space-y-1.5">
              <Label>Booking Type <span className="text-destructive">*</span></Label>
              <Select value={watchBookingType || "One-time"} onValueChange={v => v && setValue("booking_type", v as typeof BOOKING_TYPES[number])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="One-time">One-time</SelectItem>
                  <SelectItem value="Recurring">Recurring</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Seater Type */}
            <div className="space-y-1.5">
              <Label>Seater Type</Label>
              <Select value={watchSeater || ""} onValueChange={v => setValue("seater_type", v ? v as typeof SEATER_TYPES[number] : undefined)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select seater…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-Seater">1-Seater — Solo</SelectItem>
                  <SelectItem value="2-Seater">2-Seater — Co-host</SelectItem>
                  <SelectItem value="3-Seater">3-Seater — Panel of 3</SelectItem>
                  <SelectItem value="4-Seater">4-Seater — Full panel</SelectItem>
                </SelectContent>
              </Select>
              {watchSeater && activeRate && (
                <p className="text-xs text-muted-foreground">
                  Rates: ₹{activeRate.recording_rate_per_hour.toLocaleString("en-IN")}/hr recording · ₹{activeRate.editing_rate_per_hour.toLocaleString("en-IN")}/hr editing
                </p>
              )}
              {watchSeater && !activeRate && rates.length > 0 && (
                <p className="text-xs text-muted-foreground">No rates configured for {watchSeater} — <a href="/podcast-studio/settings" className="underline">set in Studio Settings</a></p>
              )}
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={watch("status") || "Confirmed"} onValueChange={v => v && setValue("status", v as FormData["status"])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Confirmed">Confirmed</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Recurring Config */}
            {watchBookingType === "Recurring" && !isEdit && (() => {
              const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
              const recurringDates = generateRecurringDates(watchDate, recurringDays, recurringUntil, recurringFreq, customDates);
              const PREVIEW_MAX = 6;
              const showDays = recurringFreq === "weekly" || recurringFreq === "biweekly";
              const showUntil = recurringFreq !== "custom";
              return (
                <div className="sm:col-span-2 rounded-lg border border-violet-200 bg-violet-50/50 p-4 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
                    <RefreshCw className="h-4 w-4" /> Recurring Schedule
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Frequency */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Frequency</Label>
                      <Select value={recurringFreq} onValueChange={v => setRecurringFreq(v as typeof recurringFreq)}>
                        <SelectTrigger className="h-8 text-sm bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Every week</SelectItem>
                          <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                          <SelectItem value="monthly">Every month</SelectItem>
                          <SelectItem value="custom">Custom dates</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Until */}
                    {showUntil && (
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs">Repeat until</Label>
                        <Input
                          type="date"
                          className="h-8 text-sm bg-white"
                          value={recurringUntil}
                          min={watchDate || undefined}
                          onChange={e => setRecurringUntil(e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Days of week — weekly / bi-weekly only */}
                  {showDays && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Days of week</Label>
                      <div className="flex gap-1.5">
                        {DAY_LABELS.map((label, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setRecurringDays(prev =>
                              prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx]
                            )}
                            className={cn(
                              "w-8 h-8 rounded-full text-xs font-semibold transition-colors",
                              recurringDays.includes(idx)
                                ? "bg-violet-600 text-white"
                                : "bg-white border text-muted-foreground hover:border-violet-400"
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Custom date picker */}
                  {recurringFreq === "custom" && (
                    <div className="space-y-2">
                      <Label className="text-xs">Add specific dates</Label>
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          className="h-8 text-sm bg-white"
                          value={customDateInput}
                          min={watchDate || undefined}
                          onChange={e => setCustomDateInput(e.target.value)}
                        />
                        <button
                          type="button"
                          disabled={!customDateInput || customDates.includes(customDateInput)}
                          onClick={() => {
                            if (customDateInput && !customDates.includes(customDateInput)) {
                              setCustomDates(prev => [...prev, customDateInput]);
                              setCustomDateInput("");
                            }
                          }}
                          className="px-3 h-8 rounded-md border text-xs font-medium bg-white hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                        >
                          Add
                        </button>
                      </div>
                      {customDates.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {[...customDates].sort().map(d => (
                            <span key={d} className="flex items-center gap-1 bg-white border border-violet-200 rounded px-2 py-0.5 text-[11px]">
                              {new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                              <button
                                type="button"
                                onClick={() => setCustomDates(prev => prev.filter(x => x !== d))}
                                className="text-muted-foreground hover:text-destructive leading-none"
                              >×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Preview */}
                  {recurringDates.length > 0 ? (
                    <div className="text-xs text-violet-800 space-y-1">
                      <span className="font-semibold">{recurringDates.length} booking{recurringDates.length !== 1 ? "s" : ""} will be created</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {recurringDates.slice(0, PREVIEW_MAX).map(d => (
                          <span key={d} className="bg-white border border-violet-200 rounded px-1.5 py-0.5 text-[11px]">
                            {new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          </span>
                        ))}
                        {recurringDates.length > PREVIEW_MAX && (
                          <span className="text-muted-foreground text-[11px] self-center">+{recurringDates.length - PREVIEW_MAX} more</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {recurringFreq === "custom"
                        ? "Add at least one date above."
                        : recurringFreq === "monthly"
                        ? "Set an end date to preview slots."
                        : "Select at least one day and an end date to preview slots."}
                    </p>
                  )}

                  {/* Progress during submit */}
                  {recurringProgress && (
                    <div className="flex items-center gap-2 text-xs text-violet-700 bg-white border border-violet-200 rounded-md px-3 py-2">
                      <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                      Creating bookings… {recurringProgress.done}/{recurringProgress.total}
                      {recurringProgress.conflicts > 0 && ` · ${recurringProgress.conflicts} conflict${recurringProgress.conflicts !== 1 ? "s" : ""} skipped`}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Client Name */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="client_name">Client Name <span className="text-destructive">*</span></Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="client_name" className="pl-9" placeholder="e.g. Rahul Sharma / MyCo Podcast" {...register("client_name")} />
              </div>
              {errors.client_name && <p className="text-xs text-destructive">{errors.client_name.message}</p>}
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" placeholder="+91 98765 43210" {...register("phone")} />
            </div>

            {/* Notes */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                placeholder="Episode name, requirements, special requests…"
                {...register("notes")}
              />
            </div>
          </div>

          {/* Availability indicator */}
          {availabilityMsg && (
            <div className={cn(
              "mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
              availabilityMsg.type === "ok" && "bg-emerald-50 text-emerald-700",
              availabilityMsg.type === "conflict" && "bg-red-50 text-red-700",
              availabilityMsg.type === "loading" && "bg-muted text-muted-foreground",
            )}>
              {availabilityMsg.type === "ok" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
              {availabilityMsg.type === "conflict" && <AlertCircle className="h-4 w-4 shrink-0" />}
              {availabilityMsg.type === "loading" && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
              {availabilityMsg.msg}
            </div>
          )}
        </div>

        {/* Section B: Revenue Components */}
        <div className="bg-card border rounded-xl p-6">
          <SectionTitle icon={<DollarSign className="h-4 w-4" />} title="Revenue Components" sub="Recording, editing, and GST" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Recording Hours */}
            <div className="space-y-1.5">
              <Label htmlFor="recording_hours">Recording Hours</Label>
              <Input id="recording_hours" type="number" step="0.5" min="0" placeholder="0" {...register("recording_hours", { valueAsNumber: true })} />
            </div>

            {/* Recording Value */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="recording_value">Recording Value (₹)</Label>
                {suggestedRecValue !== null && suggestedRecValue > 0 && (
                  <button
                    type="button"
                    onClick={() => setValue("recording_value", suggestedRecValue)}
                    className="flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-700 font-medium"
                  >
                    <Wand2 className="h-3 w-3" /> Use suggested
                  </button>
                )}
              </div>
              <Input id="recording_value" type="number" step="1" min="0" placeholder="0" {...register("recording_value", { valueAsNumber: true })} />
              {suggestedRecValue !== null && suggestedRecValue > 0 && (
                <p className="text-xs text-muted-foreground">
                  Suggested: ₹{suggestedRecValue.toLocaleString("en-IN")}
                  {" "}({watchRecHours} hr{Number(watchRecHours) !== 1 ? "s" : ""} × ₹{activeRate!.recording_rate_per_hour.toLocaleString("en-IN")}/hr for {watchSeater})
                </p>
              )}
              {watchSeater && activeRate && Number(watchRecHours) === 0 && (
                <p className="text-xs text-muted-foreground">Enter recording hours to see suggested value</p>
              )}
            </div>

            {/* Editing Hours */}
            <div className="space-y-1.5">
              <Label htmlFor="editing_hours">Editing Hours</Label>
              <Input id="editing_hours" type="number" step="0.5" min="0" placeholder="0" {...register("editing_hours", { valueAsNumber: true })} />
            </div>

            {/* Editing Value */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="editing_value">Editing Value (₹)</Label>
                {suggestedEditValue !== null && suggestedEditValue > 0 && (
                  <button
                    type="button"
                    onClick={() => setValue("editing_value", suggestedEditValue)}
                    className="flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-700 font-medium"
                  >
                    <Wand2 className="h-3 w-3" /> Use suggested
                  </button>
                )}
              </div>
              <Input id="editing_value" type="number" step="1" min="0" placeholder="0" {...register("editing_value", { valueAsNumber: true })} />
              {suggestedEditValue !== null && suggestedEditValue > 0 && (
                <p className="text-xs text-muted-foreground">
                  Suggested: ₹{suggestedEditValue.toLocaleString("en-IN")}
                  {" "}({watchEditHours} hr{Number(watchEditHours) !== 1 ? "s" : ""} × ₹{activeRate!.editing_rate_per_hour.toLocaleString("en-IN")}/hr for {watchSeater})
                </p>
              )}
              {watchSeater && activeRate && Number(watchEditHours) === 0 && (
                <p className="text-xs text-muted-foreground">Enter editing hours to see suggested value</p>
              )}
            </div>

            {/* GST */}
            <div className="space-y-1.5">
              <Label htmlFor="gst_percent">GST %</Label>
              <Input id="gst_percent" type="number" step="0.01" min="0" max="100" placeholder="18" {...register("gst_percent", { valueAsNumber: true })} />
            </div>
          </div>
        </div>

        {submitError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {submitError}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting} className="bg-violet-600 hover:bg-violet-700 text-white">
            {isSubmitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {isEdit ? "Save Changes" : "Save Booking"}
          </Button>
          {!isEdit && (
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={handleSubmit(onSubmitAndNew)}>
              Save & New
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        </div>
      </form>

      {/* Live summary */}
      <div className="space-y-4">
        <div className="bg-card border rounded-xl p-5 sticky top-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-violet-600" /> Booking Summary
          </h3>
          {watchBookingType === "Recurring" && !isEdit && (() => {
            const count = generateRecurringDates(watchDate, recurringDays, recurringUntil, recurringFreq, customDates).length;
            return count > 0 ? (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-violet-100 px-3 py-2 text-sm text-violet-800">
                <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                <span><span className="font-bold">{count}</span> recurring slots</span>
              </div>
            ) : null;
          })()}
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{watchDate || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Start</span><span className="font-medium">{watchTime ? formatTimeDisplay(watchTime) : "—"}</span></div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">End</span>
              <span className={cn("font-medium", endExceedsClose && "text-destructive")}>
                {endTime ? `${formatTimeDisplay(endTime)}${endExceedsClose ? " ⚠️" : ""}` : "—"}
              </span>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span className="font-medium">{watchDuration ? formatDuration(Number(watchDuration)) : "—"}</span></div>
            {watchBookingType && <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium">{watchBookingType}</span></div>}
            {watchSeater && <div className="flex justify-between"><span className="text-muted-foreground">Seater</span><span className="font-medium">{watchSeater}</span></div>}
            <div className="border-t pt-3 space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Base Amount</span><span className="font-medium">₹{base.toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">GST ({watchGst}%)</span><span className="font-medium">₹{gstAmt.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></div>
              <div className="flex justify-between font-bold border-t pt-2">
                <span>Total Revenue</span>
                <span className="text-violet-700">₹{total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-muted/50 rounded-xl p-4 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Studio Hours</p>
          <p>Open: 10:00 AM · Close: 8:30 PM</p>
          <p>Slots: 30-min intervals · 21 slots/day</p>
          {watchSeater && activeRate && (activeRate.recording_rate_per_hour > 0 || activeRate.editing_rate_per_hour > 0) && (
            <>
              <div className="border-t pt-1 mt-1">
                <p className="font-medium text-foreground">{watchSeater} Rates</p>
                {activeRate.recording_rate_per_hour > 0 && <p>Recording: ₹{activeRate.recording_rate_per_hour.toLocaleString("en-IN")}/hr</p>}
                {activeRate.editing_rate_per_hour > 0 && <p>Editing: ₹{activeRate.editing_rate_per_hour.toLocaleString("en-IN")}/hr</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
