import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskTable } from "@/components/tasks/TaskTable";
import { KanbanBoard } from "@/components/tasks/KanbanBoard";
import { Plus, List, LayoutGrid } from "lucide-react";
import { hasPermission, taskScopeFilter } from "@/lib/rbac";
import type { Prisma } from "@/lib/generated/prisma/client";

type SearchParams = Promise<{
  view?: string;
  status?: string;
  assigned_to?: string;
  page?: string;
}>;

export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  const sp = await searchParams;
  const view = sp.view ?? "list";

  const scope = session?.user ? taskScopeFilter(session.user.role, session.user.id) : null;

  const where: Prisma.TaskWhereInput = {
    deleted_at: null,
    ...(sp.status && sp.status !== "all" && { status: sp.status as Prisma.EnumTaskStatusFilter }),
    // For Sales/Operations: always restrict to own tasks; ignore assigned_to filter from URL
    ...(scope ?? (sp.assigned_to && sp.assigned_to !== "all" && { assigned_to_id: sp.assigned_to })),
  };

  const [tasks, users] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        assigned_to: { select: { id: true, name: true } },
        lead: { select: { id: true, lead_number: true, full_name: true } },
        opportunity: { select: { id: true, opp_number: true, name: true } },
      },
      orderBy: { due_date: "asc" },
      take: 100,
    }),
    prisma.user.findMany({
      where: { is_active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const canCreate = session?.user && hasPermission(session.user.role, "task:create");
  const isScoped = !!scope; // Sales/Operations — can only see own tasks

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tasks</h1>
          <p className="text-sm text-muted-foreground">{tasks.length} tasks</p>
        </div>
        <div className="flex gap-2">
          <div className="flex border rounded-md overflow-hidden">
            <Link
              href={`/tasks?view=list`}
              className={`p-2 ${view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              <List className="h-4 w-4" />
            </Link>
            <Link
              href={`/tasks?view=kanban`}
              className={`p-2 ${view === "kanban" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </Link>
          </div>
          {canCreate && (
            <Button render={<Link href="/tasks/new" />}>
              <Plus className="h-4 w-4 mr-1" />
              New Task
            </Button>
          )}
        </div>
      </div>

      {view === "kanban" ? (
        <KanbanBoard tasks={tasks} />
      ) : (
        <TaskTable tasks={tasks} users={isScoped ? [] : users} currentParams={sp} />
      )}
    </div>
  );
}
