import { Mic2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { SlotCalendar } from "@/components/podcast-studio/SlotCalendar";

export default function PodcastCalendarPage() {
  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-violet-600 text-white flex items-center justify-center">
            <Mic2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Availability Calendar</h1>
            <p className="text-sm text-muted-foreground">10:00 AM – 8:30 PM · 21 slots per day</p>
          </div>
        </div>
        <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" render={<Link href="/podcast-studio/bookings/new" />}>
          <Plus className="h-4 w-4 mr-1.5" /> New Booking
        </Button>
      </div>

      <SlotCalendar />
    </div>
  );
}
