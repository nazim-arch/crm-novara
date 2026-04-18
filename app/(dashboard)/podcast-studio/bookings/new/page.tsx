import { Mic2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { BookingForm } from "@/components/podcast-studio/BookingForm";

type SearchParams = Promise<{ date?: string; time?: string }>;

export default async function NewBookingPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
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
            <h1 className="text-xl font-bold">New Booking</h1>
            <p className="text-sm text-muted-foreground">Add a new podcast studio session</p>
          </div>
        </div>
      </div>

      <BookingForm defaultDate={sp.date} defaultTime={sp.time} />
    </div>
  );
}
