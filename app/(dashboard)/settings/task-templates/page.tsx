import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { hasPermissionAsync } from "@/lib/rbac";
import { TaskTemplatesClient } from "@/components/settings/TaskTemplatesClient";

export default async function TaskTemplatesSettingsPage() {
  const session = await auth();
  if (!session?.user || !(await hasPermissionAsync(session.user.role, "task:create"))) {
    redirect("/tasks");
  }

  const [templates, users, clients] = await Promise.all([
    prisma.taskTemplate.findMany({
      where: { is_active: true },
      include: {
        default_assignee: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({ where: { is_active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ where: { is_active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="p-3 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Task Templates</h1>
        <p className="text-sm text-muted-foreground">
          Reusable task presets. Pick one on the New Task screen to prefill title, checklist, priority and more.
        </p>
      </div>
      <TaskTemplatesClient
        initialTemplates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          title: t.title,
          priority: t.priority,
          sector: t.sector,
          due_in_days: t.due_in_days,
          recurrence: t.recurrence,
          recurrence_interval: t.recurrence_interval,
          default_assignee: t.default_assignee,
          client: t.client,
          checklistCount: Array.isArray(t.checklist) ? t.checklist.length : 0,
        }))}
        users={users}
        clients={clients}
      />
    </div>
  );
}
