import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { NextResponse } from "next/server";
import { timeToMinutes, addMinutesToTime, STUDIO_SLOTS, STUDIO_CLOSE } from "@/lib/podcast-studio";
import { z } from "zod";

const updateSchema = z.object({
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  duration_minutes: z.number().int().min(30).max(630).refine(v => v % 30 === 0).optional(),
  client_name: z.string().min(1).max(200).optional(),
  phone: z.string().max(20).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  recording_hours: z.number().min(0).nullable().optional(),
  recording_value: z.number().min(0).nullable().optional(),
  editing_hours: z.number().min(0).nullable().optional(),
  editing_value: z.number().min(0).nullable().optional(),
  gst_percent: z.number().min(0).max(100).optional(),
  status: z.enum(["Confirmed", "Tentative", "Cancelled", "Completed"]).optional(),
  booking_type: z.enum(["One-time", "Recurring"]).optional(),
  seater_type: z.enum(["1-Seater", "2-Seater", "3-Seater", "4-Seater"]).nullable().optional(),
});

type Params = Promise<{ id: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "podcast_studio:manage"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const booking = await prisma.podcastStudioBooking.findUnique({ where: { id } });
    if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: {
      ...booking,
      recording_hours: booking.recording_hours !== null ? Number(booking.recording_hours) : null,
      recording_value: booking.recording_value !== null ? Number(booking.recording_value) : null,
      editing_hours: booking.editing_hours !== null ? Number(booking.editing_hours) : null,
      editing_value: booking.editing_value !== null ? Number(booking.editing_value) : null,
      gst_percent: Number(booking.gst_percent),
      base_amount: Number(booking.base_amount),
      gst_amount: Number(booking.gst_amount),
      total_revenue: Number(booking.total_revenue),
    } });
  } catch (error) {
    console.error("GET /api/podcast-studio/bookings/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "podcast_studio:manage"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const existing = await prisma.podcastStudioBooking.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });

    const d = parsed.data;

    // Use merged values for validation
    const bookingDate = d.booking_date ?? existing.booking_date;
    const startTime = d.start_time ?? existing.start_time;
    const durationMins = d.duration_minutes ?? existing.duration_minutes;

    if (d.start_time && !STUDIO_SLOTS.includes(startTime))
      return NextResponse.json({ error: "Start time must be a valid 30-minute studio slot" }, { status: 400 });

    const endTime = addMinutesToTime(startTime, durationMins);
    if (timeToMinutes(endTime) > timeToMinutes(STUDIO_CLOSE))
      return NextResponse.json({ error: `Booking would end at ${endTime}, exceeding studio close time of 8:30 PM` }, { status: 400 });

    // Overlap check (exclude self)
    if (d.booking_date || d.start_time || d.duration_minutes) {
      const others = await prisma.podcastStudioBooking.findMany({
        where: { booking_date: bookingDate, status: { not: "Cancelled" }, id: { not: id } },
        select: { id: true, start_time: true, end_time: true, client_name: true },
      });
      const newStart = timeToMinutes(startTime);
      const newEnd = timeToMinutes(endTime);
      const conflict = others.find(b => {
        const bStart = timeToMinutes(b.start_time);
        const bEnd = timeToMinutes(b.end_time);
        return newStart < bEnd && newEnd > bStart;
      });
      if (conflict)
        return NextResponse.json({
          error: `Time conflict with existing booking for "${conflict.client_name}" (${conflict.start_time}–${conflict.end_time})`,
        }, { status: 409 });
    }

    // Recalculate revenue
    const recValue = Number(d.recording_value ?? existing.recording_value ?? 0);
    const editValue = Number(d.editing_value ?? existing.editing_value ?? 0);
    const gstPct = Number(d.gst_percent ?? existing.gst_percent);
    const base = recValue + editValue;
    const gstAmt = (base * gstPct) / 100;
    const total = base + gstAmt;

    const updated = await prisma.podcastStudioBooking.update({
      where: { id },
      data: {
        ...d,
        end_time: endTime,
        base_amount: base,
        gst_amount: gstAmt,
        total_revenue: total,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/podcast-studio/bookings/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "podcast_studio:manage"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const booking = await prisma.podcastStudioBooking.findUnique({ where: { id } });
    if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.podcastStudioBooking.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/podcast-studio/bookings/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
