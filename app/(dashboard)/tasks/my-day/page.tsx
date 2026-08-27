import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { hasPermissionAsync } from "@/lib/rbac";
import { PageHeader } from "@/components/shared/PageHeader";
import { MyDayClient } from "@/components/tasks/MyDayClient";
import { startOfDay, endOfDay, addDays } from "date-fns";

export default async function MyDayPage() {
  const session = await auth();
  if (!session?.user || !(await hasPermissionAsync(session.user.role, "task:read"))) {
    redirect("/");
  }

  const now = new Date();
  const todayStart = startOfDay(now);
  const horizon = endOfDay(addDays(now, 7));

  const [tasks, completedToday] = await Promise.all([
    prisma.task.findMany({
      where: {
        deleted_at: null,
        assigned_to_id: session.user.id,
        status: { in: ["Todo", "InProgress"] },
        due_date: { lte: horizon },
      },
      select: {
        id: true, task_number: true, title: true, priority: true, status: true,
        due_date: true, checklist: true,
        lead: { select: { id: true, lead_number: true, full_name: true } },
        opportunity: { select: { id: true, opp_number: true, name: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: { due_date: "asc" },
    }),
    prisma.task.count({
      where: {
        deleted_at: null,
        assigned_to_id: session.user.id,
        status: "Done",
        completion_date: { gte: todayStart },
      },
    }),
  ]);

  return (
    <div className="p-3 sm:p-6 space-y-4">
      <PageHeader
        title="My Day"
        description="Your overdue and upcoming tasks, most urgent first"
      />
      <MyDayClient
        tasks={tasks.map((t) => ({
          ...t,
          due_date: t.due_date.toISOString(),
        }))}
        completedToday={completedToday}
        todayISO={todayStart.toISOString()}
      />
    </div>
  );
}
