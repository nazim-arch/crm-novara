import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { hasPermissionAsync } from "@/lib/rbac";
import { TaskForm } from "@/components/tasks/TaskForm";
import { TaskTemplatePicker } from "@/components/tasks/TaskTemplatePicker";
import { addDays } from "date-fns";
import type { CreateTaskInput } from "@/lib/validations/task";

type SearchParams = Promise<{ lead_id?: string; opportunity_id?: string; template?: string }>;

export default async function NewTaskPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user || !(await hasPermissionAsync(session.user.role, "task:create"))) {
    redirect("/tasks");
  }

  const sp = await searchParams;

  const [users, leads, opportunities, clients, templates] = await Promise.all([
    prisma.user.findMany({
      where: { is_active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.lead.findMany({
      where: { deleted_at: null },
      select: { id: true, lead_number: true, full_name: true },
      orderBy: { full_name: "asc" },
      take: 100,
    }),
    prisma.opportunity.findMany({
      where: { deleted_at: null, status: "Active" },
      select: { id: true, opp_number: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.client.findMany({
      where: { is_active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.taskTemplate.findMany({
      where: { is_active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Build defaultValues from a chosen template, if any.
  let defaultValues: Partial<CreateTaskInput> | undefined;
  const template = sp.template ? templates.find((t) => t.id === sp.template) : undefined;
  if (template) {
    const due =
      template.due_in_days != null
        ? addDays(new Date(), template.due_in_days)
        : addDays(new Date(), 0);
    defaultValues = {
      title: template.title,
      description: template.description ?? undefined,
      priority: template.priority,
      sector: template.sector ?? undefined,
      due_date: due.toISOString().split("T")[0] as unknown as Date,
      recurrence: template.recurrence,
      recurrence_interval: template.recurrence_interval,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      checklist: (template.checklist as any) ?? undefined,
      revenue_tagged: template.revenue_tagged,
      revenue_amount: template.revenue_amount ? Number(template.revenue_amount) : undefined,
      assigned_to_id: template.default_assignee_id ?? session.user.id,
      client_id: template.client_id ?? undefined,
    };
  }

  return (
    <div className="p-3 sm:p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">New Task</h1>
        <p className="text-sm text-muted-foreground">Create a new task</p>
      </div>
      <TaskTemplatePicker
        templates={templates.map((t) => ({ id: t.id, name: t.name }))}
        current={sp.template}
      />
      <TaskForm
        // Remount when the template changes so the form re-initialises with new defaults.
        key={sp.template ?? "blank"}
        users={users}
        leads={leads}
        opportunities={opportunities}
        clients={clients}
        currentUserId={session.user.id}
        defaultLeadId={sp.lead_id}
        defaultOpportunityId={sp.opportunity_id}
        defaultValues={defaultValues}
      />
    </div>
  );
}
