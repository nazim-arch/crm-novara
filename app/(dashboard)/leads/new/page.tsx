import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/rbac";
import { LeadForm } from "@/components/leads/LeadForm";

export default async function NewLeadPage() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "lead:create")) {
    redirect("/leads");
  }

  const [users, opportunities] = await Promise.all([
    prisma.user.findMany({
      where: { is_active: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.opportunity.findMany({
      where: { deleted_at: null, status: "Active" },
      select: { id: true, opp_number: true, name: true, project: true, property_type: true, location: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">New Lead</h1>
        <p className="text-sm text-muted-foreground">Add a new lead to the CRM</p>
      </div>
      <LeadForm users={users} opportunities={opportunities} currentUserId={session.user.id} />
    </div>
  );
}
