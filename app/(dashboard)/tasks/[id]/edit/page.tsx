import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { hasPermission } from "@/lib/rbac";
import { TaskForm } from "@/components/tasks/TaskForm";

type Params = Promise<{ id: string }>;

export default async function EditTaskPage({ params }: { params: Params }) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "task:update")) {
    redirect("/tasks");
  }

  const { id } = await params;

  const [task, users, leads, opportunities] = await Promise.all([
    prisma.task.findUnique({
      where: { id, deleted_at: null },
    }),
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
  ]);

  if (!task) notFound();

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Edit Task</h1>
        <p className="text-sm text-muted-foreground font-mono">{task.task_number}</p>
      </div>
      <TaskForm
        users={users}
        leads={leads}
        opportunities={opportunities}
        currentUserId={session.user.id}
        taskId={task.id}
        defaultLeadId={task.lead_id ?? undefined}
        defaultOpportunityId={task.opportunity_id ?? undefined}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        defaultValues={{
          title: task.title,
          description: task.description ?? undefined,
          priority: task.priority,
          due_date: task.due_date.toISOString().split("T")[0] as unknown as Date,
          start_date: task.start_date?.toISOString().split("T")[0] as unknown as Date | undefined,
          sector: task.sector ?? undefined,
          recurrence: task.recurrence,
          revenue_tagged: task.revenue_tagged,
          revenue_amount: task.revenue_amount ? Number(task.revenue_amount) : undefined,
          notes: task.notes ?? undefined,
          assigned_to_id: task.assigned_to_id,
          lead_id: task.lead_id ?? undefined,
          opportunity_id: task.opportunity_id ?? undefined,
        }}
      />
    </div>
  );
}
