import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TaskTable } from "@/components/tasks/TaskTable";
import { KanbanBoard } from "@/components/tasks/KanbanBoard";
import { Plus, List, LayoutGrid } from "lucide-react";
import { hasPermissionAsync, taskScopeFilter } from "@/lib/rbac";
import { ExportButton } from "@/components/shared/ExportButton";
import { PageHeader } from "@/components/shared/PageHeader";
import { getVisibleColumns } from "@/lib/column-prefs";
import { TASK_COLUMNS } from "@/lib/task-columns";
import type { Prisma } from "@/lib/generated/prisma/client";

type SearchParams = Promise<{ view?: string }>;

export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  const sp = await searchParams;
  const view = sp.view ?? "list";
  const canExport = session?.user ? await hasPermissionAsync(session.user.role, "task:export") : false;

  const scope = session?.user ? taskScopeFilter(session.user.role, session.user.id) : null;

  const where: Prisma.TaskWhereInput = {
    deleted_at: null,
    ...(scope ?? {}),
  };

  const [tasks, users, clients] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        assigned_to: { select: { id: true, name: true } },
        lead: { select: { id: true, lead_number: true, full_name: true } },
        opportunity: { select: { id: true, opp_number: true, name: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: { due_date: "asc" },
      take: 200,
    }),
    prisma.user.findMany({
      where: { is_active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.client.findMany({
      where: { is_active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const canCreate = session?.user && await hasPermissionAsync(session.user.role, "task:create");
  const isScoped = !!scope;

  const visibleTaskCols = session?.user
    ? await getVisibleColumns(session.user.id, "tasks", TASK_COLUMNS)
    : new Set(TASK_COLUMNS.map((c) => c.id));

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-4">
      <PageHeader
        title="Tasks"
        description={`${tasks.length} tasks`}
        actions={
          <>
            <div className="flex border rounded-lg overflow-hidden" role="group" aria-label="View mode">
              <Link
                href="/tasks?view=list"
                aria-label="List view"
                className={`p-2 transition-colors ${view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <List className="h-4 w-4" />
              </Link>
              <Link
                href="/tasks?view=kanban"
                aria-label="Kanban view"
                className={`p-2 transition-colors ${view === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </Link>
            </div>
            {canExport && <ExportButton href="/api/tasks/export" filename="tasks.xlsx" />}
            {canCreate && (
              <Button render={<Link href="/tasks/new" />} size="sm">
                <Plus className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">New Task</span>
              </Button>
            )}
          </>
        }
      />

      {view === "kanban" ? (
        <KanbanBoard tasks={tasks} />
      ) : (
        <TaskTable tasks={tasks} users={isScoped ? [] : users} clients={clients} currentParams={{}} initialColumns={[...visibleTaskCols]} />
      )}
    </div>
  );
}
