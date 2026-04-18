import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { NextResponse } from "next/server";
import { timeToMinutes, addMinutesToTime, STUDIO_SLOTS, STUDIO_CLOSE } from "@/lib/podcast-studio";
import { z } from "zod";

const createSchema = z.object({
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
  booking_type: z.enum(["One-time", "Recurring"]).default("One-time"),
  seater_type: z.enum(["1-Seater", "2-Seater", "3-Seater", "4-Seater"]).nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "podcast_studio:manage"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Number(searchParams.get("limit") ?? "50");
    const search = searchParams.get("search") ?? "";
    const start_date = searchParams.get("start_date") ?? "";
    const end_date = searchParams.get("end_date") ?? "";
    const status = searchParams.get("status") ?? "";
    const month = searchParams.get("month") ?? ""; // "YYYY-MM"

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (search) {
      where.OR = [
        { client_name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }
    if (status && status !== "all") where.status = status;
    if (start_date) where.booking_date = { ...where.booking_date, gte: start_date };
    if (end_date) where.booking_date = { ...where.booking_date, lte: end_date };
    if (month) {
      const [y, m] = month.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      where.booking_date = {
        gte: `${y}-${String(m).padStart(2, "0")}-01`,
        lte: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
      };
    }

    const [total, bookings] = await Promise.all([
      prisma.podcastStudioBooking.count({ where }),
      prisma.podcastStudioBooking.findMany({
        where,
        orderBy: [{ booking_date: "desc" }, { start_time: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const serialized = bookings.map(b => ({
      ...b,
      recording_hours: b.recording_hours !== null ? Number(b.recording_hours) : null,
      recording_value: b.recording_value !== null ? Number(b.recording_value) : null,
      editing_hours: b.editing_hours !== null ? Number(b.editing_hours) : null,
      editing_value: b.editing_value !== null ? Number(b.editing_value) : null,
      gst_percent: Number(b.gst_percent),
      base_amount: Number(b.base_amount),
      gst_amount: Number(b.gst_amount),
      total_revenue: Number(b.total_revenue),
    }));
    return NextResponse.json({ data: serialized, meta: { total, page, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("GET /api/podcast-studio/bookings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "podcast_studio:manage"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });

    const d = parsed.data;

    // Validate start_time is a valid studio slot
    if (!STUDIO_SLOTS.includes(d.start_time))
      return NextResponse.json({ error: "Start time must be a valid 30-minute studio slot (10:00 AM – 8:00 PM)" }, { status: 400 });

    // Calculate end time and validate it doesn't exceed studio close
    const endTime = addMinutesToTime(d.start_time, d.duration_minutes);
    if (timeToMinutes(endTime) > timeToMinutes(STUDIO_CLOSE))
      return NextResponse.json({ error: `Booking would end at ${endTime}, exceeding studio close time of 8:30 PM` }, { status: 400 });

    // Overlap check
    const existing = await prisma.podcastStudioBooking.findMany({
      where: { booking_date: d.booking_date, status: { not: "Cancelled" } },
      select: { id: true, start_time: true, end_time: true, client_name: true },
    });

    const newStart = timeToMinutes(d.start_time);
    const newEnd = timeToMinutes(endTime);
    const conflict = existing.find(b => {
      const bStart = timeToMinutes(b.start_time);
      const bEnd = timeToMinutes(b.end_time);
      return newStart < bEnd && newEnd > bStart;
    });
    if (conflict)
      return NextResponse.json({
        error: `Time conflict with existing booking for "${conflict.client_name}" (${conflict.start_time}–${conflict.end_time})`,
      }, { status: 409 });

    // Calculate revenue
    const recValue = Number(d.recording_value ?? 0);
    const editValue = Number(d.editing_value ?? 0);
    const base = recValue + editValue;
    const gstAmt = (base * Number(d.gst_percent)) / 100;
    const total = base + gstAmt;

    const booking = await prisma.podcastStudioBooking.create({
      data: {
        booking_date: d.booking_date,
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
      },
    });

    return NextResponse.json({ data: booking }, { status: 201 });
  } catch (error) {
    console.error("POST /api/podcast-studio/bookings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
