import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AuditLogClient } from "@/components/reports/AuditLogClient";

export default async function AuditLogPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!["Admin", "Manager"].includes(session.user.role ?? "")) redirect("/dashboard/crm");

  const users = await prisma.user.findMany({
    where: { is_active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Track all changes across Leads, Opportunities, Tasks, and Users
        </p>
      </div>
      <AuditLogClient users={users} />
    </div>
  );
}
