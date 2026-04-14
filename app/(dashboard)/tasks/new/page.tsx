import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/rbac";
import { TaskForm } from "@/components/tasks/TaskForm";

type SearchParams = Promise<{ lead_id?: string; opportunity_id?: string }>;

export default async function NewTaskPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "task:create")) {
    redirect("/tasks");
  }

  const sp = await searchParams;

  const [users, leads, opportunities, clients] = await Promise.all([
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
  ]);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">New Task</h1>
        <p className="text-sm text-muted-foreground">Create a new task</p>
      </div>
      <TaskForm
        users={users}
        leads={leads}
        opportunities={opportunities}
        clients={clients}
        currentUserId={session.user.id}
        defaultLeadId={sp.lead_id}
        defaultOpportunityId={sp.opportunity_id}
      />
    </div>
  );
}
