import { Mic2 } from "lucide-react";
import { BookingsList } from "@/components/podcast-studio/BookingsList";

export default function PodcastBookingsPage() {
  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-600 text-white flex items-center justify-center">
          <Mic2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Bookings</h1>
          <p className="text-sm text-muted-foreground">All studio sessions · Revenue view</p>
        </div>
      </div>

      <BookingsList />
    </div>
  );
}
