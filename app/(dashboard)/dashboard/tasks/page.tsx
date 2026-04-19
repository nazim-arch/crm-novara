import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskStatsCards } from "@/components/dashboard/TaskStatsCards";
import { AssigneeBarChart } from "@/components/dashboard/AssigneeBarChart";
import { ClientBarChart } from "@/components/dashboard/ClientBarChart";
import { DashboardFilters } from "@/components/podcast-studio/DashboardFilters";
import { resolveDateRange, type DashboardRange } from "@/lib/date-range";
import { startOfDay, endOfDay } from "date-fns";
import Link from "next/link";
import { Suspense } from "react";

function todayIST() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type SearchParams = Promise<{ range?: string; from?: string; to?: string }>;

export default async function TaskDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "task:read")) redirect("/");

  const sp = await searchParams;
  const todayStr = todayIST();
  const range = (sp.range ?? "current_month") as DashboardRange;
  const { start, end, label: rangeLabel } = resolveDateRange(range, todayStr, sp.from, sp.to);
  const rangeStart = new Date(start + "T00:00:00");
  const rangeEnd = new Date(end + "T23:59:59");

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  const isScoped = session.user.role === "Sales" || session.user.role === "Operations";
  const scopeFilter = isScoped ? { assigned_to_id: session.user.id } : {};

  // Range filter: tasks due within the selected range
  const rangeFilter = { due_date: { gte: rangeStart, lte: rangeEnd } };

  const [
    // All-time active counts
    totalTasks,
    overdueTasks,
    dueTodayTasks,
    myTasks,
    // Range-filtered counts
    totalInRange,
    completedInRange,
    // Charts
    byAssignee,
    revenueAtRisk,
    byClient,
  ] = await Promise.all([
    prisma.task.count({ where: { deleted_at: null, ...scopeFilter, status: { notIn: ["Done", "Cancelled"] } } }),
    prisma.task.count({
      where: { deleted_at: null, ...scopeFilter, due_date: { lt: todayStart }, status: { notIn: ["Done", "Cancelled"] } },
    }),
    prisma.task.count({
      where: { deleted_at: null, ...scopeFilter, due_date: { gte: todayStart, lte: todayEnd }, status: { notIn: ["Done", "Cancelled"] } },
    }),
    prisma.task.count({
      where: { deleted_at: null, assigned_to_id: session.user.id, status: { notIn: ["Done", "Cancelled"] } },
    }),
    // Range-filtered
    prisma.task.count({ where: { deleted_at: null, ...scopeFilter, ...rangeFilter } }),
    prisma.task.count({ where: { deleted_at: null, ...scopeFilter, ...rangeFilter, status: "Done" } }),
    // Charts scoped to range
    prisma.task.groupBy({
      by: ["assigned_to_id"],
      where: { deleted_at: null, ...scopeFilter, ...rangeFilter, status: { notIn: ["Done", "Cancelled"] } },
      _count: { id: true },
    }),
    prisma.task.aggregate({
      where: {
        deleted_at: null, ...scopeFilter, revenue_tagged: true, revenue_amount: { not: null },
        due_date: { lt: todayStart }, status: { notIn: ["Done", "Cancelled"] },
      },
      _sum: { revenue_amount: true },
    }),
    prisma.task.groupBy({
      by: ["client_id"],
      where: { deleted_at: null, ...scopeFilter, ...rangeFilter, status: { notIn: ["Done", "Cancelled"] }, client_id: { not: null } },
      _count: { id: true },
    }),
  ]);

  const assigneeIds = byAssignee.map(a => a.assigned_to_id);
  const clientIds = byClient.map(c => c.client_id).filter(Boolean) as string[];

  const [users, clientRecords] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } }),
    prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }),
  ]);

  const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));
  const clientMap = Object.fromEntries(clientRecords.map(c => [c.id, c.name]));

  const assigneeData = byAssignee.map(a => ({ name: userMap[a.assigned_to_id] ?? "Unknown", count: a._count.id }));
  const clientData = byClient.map(c => ({ name: clientMap[c.client_id!] ?? "Unknown", count: c._count.id }));

  const completionRate = totalInRange > 0 ? Math.round((completedInRange / totalInRange) * 100) : null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Task Dashboard</h1>
        <p className="text-sm text-muted-foreground">{isScoped ? "Your task overview" : "Team task overview"}</p>
      </div>

      <Suspense>
        <DashboardFilters currentRange={range} currentFrom={sp.from} currentTo={sp.to} rangeLabel={rangeLabel} />
      </Suspense>

      {/* Range-scoped summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">{rangeLabel} — Total</p>
            <p className="text-2xl font-bold">{totalInRange}</p>
            <p className="text-xs text-muted-foreground mt-0.5">tasks due in period</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">{rangeLabel} — Completed</p>
            <p className="text-2xl font-bold text-emerald-600">{completedInRange}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {completionRate != null ? `${completionRate}% completion rate` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Overdue (today)</p>
            <p className={`text-2xl font-bold ${overdueTasks > 0 ? "text-destructive" : ""}`}>{overdueTasks}</p>
            <p className="text-xs text-muted-foreground mt-0.5">past due date, not done</p>
          </CardContent>
        </Card>
      </div>

      <TaskStatsCards
        totalTasks={totalTasks}
        overdueTasks={overdueTasks}
        dueTodayTasks={dueTodayTasks}
        myTasks={myTasks}
        revenueAtRisk={Number(revenueAtRisk._sum.revenue_amount ?? 0)}
      />

      <div className={`grid grid-cols-1 gap-6 ${!isScoped ? "lg:grid-cols-2" : ""}`}>
        {!isScoped && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Active Tasks by Assignee — {rangeLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              {assigneeData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active tasks in this period.</p>
              ) : (
                <AssigneeBarChart data={assigneeData} />
              )}
            </CardContent>
          </Card>
        )}
        {clientData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Active Tasks by Client — {rangeLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <ClientBarChart data={clientData} />
            </CardContent>
          </Card>
        )}

        <Card className={isScoped ? "max-w-md" : ""}>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Link href={isScoped ? `/tasks?assigned_to=${session.user.id}` : "/tasks"} className="p-3 border rounded-lg hover:bg-muted transition-colors text-sm">
              <p className="font-medium">{isScoped ? "My Tasks" : "All Tasks"}</p>
              <p className="text-muted-foreground text-xs mt-0.5">View &amp; filter</p>
            </Link>
            <Link href={`/tasks?view=kanban${isScoped ? `&assigned_to=${session.user.id}` : ""}`} className="p-3 border rounded-lg hover:bg-muted transition-colors text-sm">
              <p className="font-medium">Kanban View</p>
              <p className="text-muted-foreground text-xs mt-0.5">Drag &amp; drop</p>
            </Link>
            <Link href="/tasks/new" className="p-3 border rounded-lg hover:bg-muted transition-colors text-sm">
              <p className="font-medium">New Task</p>
              <p className="text-muted-foreground text-xs mt-0.5">Create a task</p>
            </Link>
            {!isScoped && (
              <Link href={`/tasks?assigned_to=${session.user.id}`} className="p-3 border rounded-lg hover:bg-muted transition-colors text-sm">
                <p className="font-medium">My Tasks</p>
                <p className="text-muted-foreground text-xs mt-0.5">Assigned to me</p>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
