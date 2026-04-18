import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Mic2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { BookingForm } from "@/components/podcast-studio/BookingForm";

type Params = Promise<{ id: string }>;

export default async function EditBookingPage({ params }: { params: Params }) {
  const { id } = await params;
  const booking = await prisma.podcastStudioBooking.findUnique({ where: { id } });
  if (!booking) notFound();

  // Convert Decimal fields to plain numbers for client component
  const editBooking = {
    id: booking.id,
    booking_date: booking.booking_date,
    start_time: booking.start_time,
    end_time: booking.end_time,
    duration_minutes: booking.duration_minutes,
    client_name: booking.client_name,
    phone: booking.phone,
    notes: booking.notes,
    recording_hours: booking.recording_hours ? Number(booking.recording_hours) : null,
    recording_value: booking.recording_value ? Number(booking.recording_value) : null,
    editing_hours: booking.editing_hours ? Number(booking.editing_hours) : null,
    editing_value: booking.editing_value ? Number(booking.editing_value) : null,
    gst_percent: Number(booking.gst_percent),
    base_amount: Number(booking.base_amount),
    gst_amount: Number(booking.gst_amount),
    total_revenue: Number(booking.total_revenue),
    status: booking.status as "Confirmed" | "Cancelled" | "Completed",
    booking_type: (booking.booking_type ?? "One-time") as "One-time" | "Recurring",
    seater_type: booking.seater_type as "1-Seater" | "2-Seater" | "3-Seater" | "4-Seater" | null | undefined,
  };

  return (
    <div className="p-6 max-w-screen-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/podcast-studio/bookings" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-violet-600 text-white flex items-center justify-center">
            <Mic2 className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Edit Booking</h1>
            <p className="text-sm text-muted-foreground">{booking.client_name} · {booking.booking_date}</p>
          </div>
        </div>
      </div>

      <BookingForm editBooking={editBooking} />
    </div>
  );
}
