import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { NextResponse } from "next/server";
import { timeToMinutes, addMinutesToTime, STUDIO_SLOTS, STUDIO_CLOSE } from "@/lib/podcast-studio";
import { z } from "zod";

const bulkSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(366),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.number().int().min(30).max(630).refine(v => v % 30 === 0),
  client_name: z.string().min(1).max(200),
  phone: z.string().max(20).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  recording_hours: z.number().min(0).optional().nullable(),
  recording_value: z.number().min(0).optional().nullable(),
  editing_hours: z.number().min(0).optional().nullable(),
  editing_value: z.number().min(0).optional().nullable(),
  gst_percent: z.number().min(0).max(100).default(18),
  status: z.enum(["Confirmed", "Cancelled", "Completed"]).default("Confirmed"),
  booking_type: z.enum(["One-time", "Recurring"]).default("Recurring"),
  seater_type: z.enum(["1-Seater", "2-Seater", "3-Seater", "4-Seater"]).nullable().optional(),
  recurring_group_id: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "podcast_studio:manage"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });

    const d = parsed.data;

    if (!STUDIO_SLOTS.includes(d.start_time))
      return NextResponse.json({ error: "Start time must be a valid 30-minute studio slot" }, { status: 400 });

    const endTime = addMinutesToTime(d.start_time, d.duration_minutes);
    if (timeToMinutes(endTime) > timeToMinutes(STUDIO_CLOSE))
      return NextResponse.json({ error: `Booking would end at ${endTime}, exceeding studio close time of 8:30 PM` }, { status: 400 });

    const newStart = timeToMinutes(d.start_time);
    const newEnd = timeToMinutes(endTime);

    // Pre-fetch all existing bookings for the date range in one query
    const sortedDates = [...d.dates].sort();
    const existing = await prisma.podcastStudioBooking.findMany({
      where: {
        booking_date: { in: d.dates },
        status: { not: "Cancelled" },
      },
      select: { booking_date: true, start_time: true, end_time: true, client_name: true },
    });

    // Group existing bookings by date for fast lookup
    const byDate = new Map<string, typeof existing>();
    for (const b of existing) {
      const list = byDate.get(b.booking_date) ?? [];
      list.push(b);
      byDate.set(b.booking_date, list);
    }

    const recValue = Number(d.recording_value ?? 0);
    const editValue = Number(d.editing_value ?? 0);
    const base = recValue + editValue;
    const gstAmt = (base * Number(d.gst_percent)) / 100;
    const total = base + gstAmt;

    const created: { date: string; id: string }[] = [];
    const conflicts: { date: string; reason: string }[] = [];

    for (const date of sortedDates) {
      const dayBookings = byDate.get(date) ?? [];
      const conflict = dayBookings.find(b => {
        const bStart = timeToMinutes(b.start_time);
        const bEnd = timeToMinutes(b.end_time);
        return newStart < bEnd && newEnd > bStart;
      });

      if (conflict) {
        conflicts.push({
          date,
          reason: `Conflicts with "${conflict.client_name}" (${conflict.start_time}–${conflict.end_time})`,
        });
        continue;
      }

      const booking = await prisma.podcastStudioBooking.create({
        data: {
          booking_date: date,
          start_time: d.start_time,
          end_time: endTime,
          duration_minutes: d.duration_minutes,
          client_name: d.client_name,
          phone: d.phone ?? null,
          notes: d.notes ?? null,
          recording_hours: d.recording_hours ?? null,
          recording_value: d.recording_value ?? null,
          editing_hours: d.editing_hours ?? null,
          editing_value: d.editing_value ?? null,
          gst_percent: d.gst_percent,
          base_amount: base,
          gst_amount: gstAmt,
          total_revenue: total,
          status: d.status,
          booking_type: d.booking_type,
          seater_type: d.seater_type ?? null,
          recurring_group_id: d.recurring_group_id,
        },
      });

      created.push({ date, id: booking.id });
      // Add to local map so same-date duplicates in the input list are also caught
      const list = byDate.get(date) ?? [];
      list.push({ booking_date: date, start_time: d.start_time, end_time: endTime, client_name: d.client_name });
      byDate.set(date, list);
    }

    return NextResponse.json({
      created,
      conflicts,
      summary: { created: created.length, conflicts: conflicts.length },
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/podcast-studio/bookings/bulk:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
