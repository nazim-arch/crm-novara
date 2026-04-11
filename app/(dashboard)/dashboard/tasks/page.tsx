import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskStatsCards } from "@/components/dashboard/TaskStatsCards";
import { AssigneeBarChart } from "@/components/dashboard/AssigneeBarChart";
import { startOfDay, endOfDay } from "date-fns";
import Link from "next/link";

export default async function TaskDashboardPage() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "task:read")) {
    redirect("/");
  }

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  const isScoped = session.user.role === "Operations";
  const scopeFilter = isScoped ? { assigned_to_id: session.user.id } : {};

  const [
    totalTasks,
    overdueTasks,
    dueTodayTasks,
    myTasks,
    byAssignee,
    revenueAtRisk,
  ] = await Promise.all([
    prisma.task.count({ where: { deleted_at: null, ...scopeFilter, status: { notIn: ["Done", "Cancelled"] } } }),
    prisma.task.count({
      where: {
        deleted_at: null,
        ...scopeFilter,
        due_date: { lt: todayStart },
        status: { notIn: ["Done", "Cancelled"] },
      },
    }),
    prisma.task.count({
      where: {
        deleted_at: null,
        ...scopeFilter,
        due_date: { gte: todayStart, lte: todayEnd },
        status: { notIn: ["Done", "Cancelled"] },
      },
    }),
    prisma.task.count({
      where: {
        deleted_at: null,
        assigned_to_id: session.user.id,
        status: { notIn: ["Done", "Cancelled"] },
      },
    }),
    prisma.task.groupBy({
      by: ["assigned_to_id"],
      where: { deleted_at: null, ...scopeFilter, status: { notIn: ["Done", "Cancelled"] } },
      _count: { id: true },
    }),
    prisma.task.aggregate({
      where: {
        deleted_at: null,
        ...scopeFilter,
        revenue_tagged: true,
        revenue_amount: { not: null },
        due_date: { lt: todayStart },
        status: { notIn: ["Done", "Cancelled"] },
      },
      _sum: { revenue_amount: true },
    }),
  ]);

  const assigneeIds = byAssignee.map((a) => a.assigned_to_id);
  const users = await prisma.user.findMany({
    where: { id: { in: assigneeIds } },
    select: { id: true, name: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));

  const assigneeData = byAssignee.map((a) => ({
    name: userMap[a.assigned_to_id] ?? "Unknown",
    count: a._count.id,
  }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Task Dashboard</h1>
        <p className="text-sm text-muted-foreground">{isScoped ? "Your task overview" : "Team task overview"}</p>
      </div>

      <TaskStatsCards
        totalTasks={totalTasks}
        overdueTasks={overdueTasks}
        dueTodayTasks={dueTodayTasks}
        myTasks={myTasks}
        revenueAtRisk={Number(revenueAtRisk._sum.revenue_amount ?? 0)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Active Tasks by Assignee</CardTitle>
          </CardHeader>
          <CardContent>
            {assigneeData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active tasks.</p>
            ) : (
              <AssigneeBarChart data={assigneeData} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Link href="/tasks" className="p-3 border rounded-lg hover:bg-muted transition-colors text-sm">
              <p className="font-medium">All Tasks</p>
              <p className="text-muted-foreground text-xs mt-0.5">View &amp; filter</p>
            </Link>
            <Link href="/tasks?view=kanban" className="p-3 border rounded-lg hover:bg-muted transition-colors text-sm">
              <p className="font-medium">Kanban View</p>
              <p className="text-muted-foreground text-xs mt-0.5">Drag &amp; drop</p>
            </Link>
            <Link href="/tasks/new" className="p-3 border rounded-lg hover:bg-muted transition-colors text-sm">
              <p className="font-medium">New Task</p>
              <p className="text-muted-foreground text-xs mt-0.5">Create a task</p>
            </Link>
            <Link
              href={`/tasks?assigned_to=${session.user.id}`}
              className="p-3 border rounded-lg hover:bg-muted transition-colors text-sm"
            >
              <p className="font-medium">My Tasks</p>
              <p className="text-muted-foreground text-xs mt-0.5">Assigned to me</p>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
