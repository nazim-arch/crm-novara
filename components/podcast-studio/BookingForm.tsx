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
import { Loader2, AlertCircle, CheckCircle2, Clock, DollarSign, Calendar, User } from "lucide-react";
import {
  STUDIO_SLOTS, DURATION_OPTIONS, formatTimeDisplay, formatDuration,
  addMinutesToTime, timeToMinutes, STUDIO_CLOSE,
} from "@/lib/podcast-studio";

const schema = z.object({
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Required"),
  start_time: z.string().min(1, "Required"),
  duration_minutes: z.number().int().min(30).refine(v => v % 30 === 0, "Must be a 30-min multiple"),
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

type ExistingBooking = {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
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
      gst_percent: 18,
      status: "Confirmed" as const,
    },
  });

  const [submitError, setSubmitError] = useState("");
  const [availabilityMsg, setAvailabilityMsg] = useState<{ type: "ok" | "conflict" | "loading"; msg: string } | null>(null);

  const watchDate = watch("booking_date");
  const watchTime = watch("start_time");
  const watchDuration = watch("duration_minutes");
  const watchRecValue = watch("recording_value") ?? 0;
  const watchEditValue = watch("editing_value") ?? 0;
  const watchGst = watch("gst_percent") ?? 18;

  const base = Number(watchRecValue) + Number(watchEditValue);
  const gstAmt = (base * Number(watchGst)) / 100;
  const total = base + gstAmt;
  const endTime = watchTime && watchDuration ? addMinutesToTime(watchTime, Number(watchDuration)) : null;
  const endExceedsClose = endTime ? timeToMinutes(endTime) > timeToMinutes(STUDIO_CLOSE) : false;

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
        const res = await fetch(
          `/api/podcast-studio/slots?start_date=${watchDate}&end_date=${watchDate}`,
          { signal: controller.signal }
        );
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

        if (conflict) {
          setAvailabilityMsg({ type: "conflict", msg: `Conflicts with ${conflict.client_name} (${conflict.start_time}–${conflict.end_time})` });
        } else {
          setAvailabilityMsg({ type: "ok", msg: "Slot is available" });
        }
      } catch { /* aborted */ }
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [watchDate, watchTime, watchDuration, endTime, endExceedsClose, isEdit, editBooking?.id]);

  async function onSubmit(data: FormData) {
    setSubmitError("");
    try {
      const url = isEdit ? `/api/podcast-studio/bookings/${editBooking!.id}` : "/api/podcast-studio/bookings";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
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
          <SectionTitle icon={<Calendar className="h-4 w-4" />} title="Booking Details" sub="Date, time, client information" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="booking_date">Booking Date <span className="text-destructive">*</span></Label>
              <Input id="booking_date" type="date" {...register("booking_date")} />
              {errors.booking_date && <p className="text-xs text-destructive">{errors.booking_date.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Start Time <span className="text-destructive">*</span></Label>
              <Select value={watchTime || ""} onValueChange={v => v && setValue("start_time", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select start time…" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {STUDIO_SLOTS.map(slot => (
                    <SelectItem key={slot} value={slot}>{formatTimeDisplay(slot)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.start_time && <p className="text-xs text-destructive">{errors.start_time.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Duration <span className="text-destructive">*</span></Label>
              <Select
                value={String(watchDuration || "")}
                onValueChange={v => v && setValue("duration_minutes", Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select duration…" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {DURATION_OPTIONS.map(d => {
                    if (watchTime) {
                      const et = addMinutesToTime(watchTime, d);
                      if (timeToMinutes(et) > timeToMinutes(STUDIO_CLOSE)) return null;
                    }
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

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={watch("status") || "Confirmed"} onValueChange={v => v && setValue("status", v as FormData["status"])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Confirmed">Confirmed</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="client_name">Client Name <span className="text-destructive">*</span></Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="client_name" className="pl-9" placeholder="e.g. Rahul Sharma / MyCo Podcast" {...register("client_name")} />
              </div>
              {errors.client_name && <p className="text-xs text-destructive">{errors.client_name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" placeholder="+91 98765 43210" {...register("phone")} />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                placeholder="Episode name, requirements, special requests…"
                {...register("notes")}
              />
            </div>
          </div>

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
          <SectionTitle icon={<DollarSign className="h-4 w-4" />} title="Revenue Components" sub="Recording, editing, and tax" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="recording_hours">Recording Hours</Label>
              <Input id="recording_hours" type="number" step="0.5" min="0" placeholder="0" {...register("recording_hours", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recording_value">Recording Value (₹)</Label>
              <Input id="recording_value" type="number" step="1" min="0" placeholder="0" {...register("recording_value", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editing_hours">Editing Hours</Label>
              <Input id="editing_hours" type="number" step="0.5" min="0" placeholder="0" {...register("editing_hours", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editing_value">Editing Value (₹)</Label>
              <Input id="editing_value" type="number" step="1" min="0" placeholder="0" {...register("editing_value", { valueAsNumber: true })} />
            </div>
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

      {/* Live summary card */}
      <div className="space-y-4">
        <div className="bg-card border rounded-xl p-5 sticky top-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-violet-600" />
            Booking Summary
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium">{watchDate || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Start</span>
              <span className="font-medium">{watchTime ? formatTimeDisplay(watchTime) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">End</span>
              <span className={cn("font-medium", endExceedsClose && "text-destructive")}>
                {endTime ? `${formatTimeDisplay(endTime)}${endExceedsClose ? " ⚠️" : ""}` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-medium">{watchDuration ? formatDuration(Number(watchDuration)) : "—"}</span>
            </div>
            <div className="border-t pt-3 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base Amount</span>
                <span className="font-medium">₹{base.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST ({watchGst}%)</span>
                <span className="font-medium">₹{gstAmt.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between font-bold border-t pt-2">
                <span>Total Revenue</span>
                <span className="text-violet-700">₹{total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-muted/50 rounded-xl p-4 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Studio Hours</p>
          <p>Open: 10:00 AM</p>
          <p>Close: 8:30 PM</p>
          <p>Slots: 30-minute intervals</p>
          <p>Capacity: 21 slots/day</p>
        </div>
      </div>
    </div>
  );
}
