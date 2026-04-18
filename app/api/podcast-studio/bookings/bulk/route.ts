import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { NextResponse } from "next/server";
import { timeToMinutes, addMinutesToTime, STUDIO_SLOTS, STUDIO_CLOSE } from "@/lib/podcast-studio";
import { z } from "zod";

const slotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.number().int().min(30).max(630).refine(v => v % 30 === 0),
});

const bulkSchema = z.object({
  slots: z.array(slotSchema).min(1).max(366),
  client_name: z.string().min(1).max(200),
  phone: z.string().max(20).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  recording_hours: z.number().min(0).optional().nullable(),
  recording_value: z.number().min(0).optional().nullable(),
  editing_hours: z.number().min(0).optional().nullable(),
  editing_value: z.number().min(0).optional().nullable(),
  gst_percent: z.number().min(0).max(100).default(18),
  status: z.enum(["Confirmed", "Tentative", "Cancelled", "Completed"]).default("Confirmed"),
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

    // Validate each slot's time/duration upfront
    for (const slot of d.slots) {
      if (!STUDIO_SLOTS.includes(slot.start_time))
        return NextResponse.json({ error: `Invalid studio slot: ${slot.start_time} on ${slot.date}` }, { status: 400 });
      const et = addMinutesToTime(slot.start_time, slot.duration_minutes);
      if (timeToMinutes(et) > timeToMinutes(STUDIO_CLOSE))
        return NextResponse.json({ error: `Slot on ${slot.date} would end at ${et}, exceeding 8:30 PM close` }, { status: 400 });
    }

    // Pre-fetch all existing bookings for all requested dates in one query
    const allDates = [...new Set(d.slots.map(s => s.date))];
    const existing = await prisma.podcastStudioBooking.findMany({
      where: { booking_date: { in: allDates }, status: { not: "Cancelled" } },
      select: { booking_date: true, start_time: true, end_time: true, client_name: true },
    });

    // Group by date for fast lookup
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

    const created: { date: string; start_time: string; id: string }[] = [];
    const conflicts: { date: string; start_time: string; reason: string }[] = [];

    for (const slot of d.slots) {
      const endTime = addMinutesToTime(slot.start_time, slot.duration_minutes);
      const slotStart = timeToMinutes(slot.start_time);
      const slotEnd = timeToMinutes(endTime);
      const dayBookings = byDate.get(slot.date) ?? [];

      const conflict = dayBookings.find(b => {
        const bStart = timeToMinutes(b.start_time);
        const bEnd = timeToMinutes(b.end_time);
        return slotStart < bEnd && slotEnd > bStart;
      });

      if (conflict) {
        conflicts.push({
          date: slot.date,
          start_time: slot.start_time,
          reason: `Conflicts with "${conflict.client_name}" (${conflict.start_time}–${conflict.end_time})`,
        });
        continue;
      }

      const booking = await prisma.podcastStudioBooking.create({
        data: {
          booking_date: slot.date,
          start_time: slot.start_time,
          end_time: endTime,
          duration_minutes: slot.duration_minutes,
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

      created.push({ date: slot.date, start_time: slot.start_time, id: booking.id });
      // Track newly created so same-date duplicates in input are caught
      dayBookings.push({ booking_date: slot.date, start_time: slot.start_time, end_time: endTime, client_name: d.client_name });
      byDate.set(slot.date, dayBookings);
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
