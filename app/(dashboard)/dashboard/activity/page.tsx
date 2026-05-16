import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ActivityCalendar } from "@/components/dashboard/ActivityCalendar";

export const metadata = { title: "Activity Calendar – DealStack" };

export default async function ActivityCalendarPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const isManagerOrAdmin = role === "Admin" || role === "Manager";

  const users = isManagerOrAdmin
    ? await prisma.user.findMany({
        where: { is_active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold">Activity Calendar</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Daily breakdown of new leads, stage actions, and site visits</p>
      </div>
      <ActivityCalendar
        isManagerOrAdmin={isManagerOrAdmin}
        currentUserId={session.user.id}
        users={users}
      />
    </div>
  );
}
