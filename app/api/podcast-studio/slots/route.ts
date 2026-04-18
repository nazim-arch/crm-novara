import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { NextResponse } from "next/server";
import { STUDIO_SLOTS, getOccupiedSlots, dateRange } from "@/lib/podcast-studio";

// Returns slot availability for a date range
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "podcast_studio:manage"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const start_date = searchParams.get("start_date");
    const end_date = searchParams.get("end_date");

    if (!start_date || !end_date)
      return NextResponse.json({ error: "start_date and end_date are required" }, { status: 400 });

    const bookings = await prisma.podcastStudioBooking.findMany({
      where: { booking_date: { gte: start_date, lte: end_date }, status: { not: "Cancelled" } },
      select: {
        id: true, booking_date: true, start_time: true, end_time: true,
        duration_minutes: true, client_name: true, status: true,
      },
    });

    // Build per-date slot availability map
    const dates = dateRange(start_date, end_date);
    const availability: Record<string, {
      date: string;
      total_slots: number;
      occupied_slots: number;
      free_slots: number;
      occupancy_pct: number;
      bookings: typeof bookings;
      slot_status: Record<string, "free" | "booked">;
    }> = {};

    for (const date of dates) {
      const dayBookings = bookings.filter(b => b.booking_date === date);
      const occupiedSet = new Set<string>();
      for (const b of dayBookings) {
        for (const slot of getOccupiedSlots(b.start_time, b.duration_minutes)) {
          occupiedSet.add(slot);
        }
      }
      const total = STUDIO_SLOTS.length;
      const occupied = occupiedSet.size;
      const slot_status: Record<string, "free" | "booked"> = {};
      for (const s of STUDIO_SLOTS) slot_status[s] = occupiedSet.has(s) ? "booked" : "free";

      availability[date] = {
        date,
        total_slots: total,
        occupied_slots: occupied,
        free_slots: total - occupied,
        occupancy_pct: +((occupied / total) * 100).toFixed(1),
        bookings: dayBookings,
        slot_status,
      };
    }

    return NextResponse.json({ data: availability });
  } catch (error) {
    console.error("GET /api/podcast-studio/slots:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
