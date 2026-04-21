import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/rbac";
import { ReportsClient } from "@/components/reports/ReportsClient";

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "Admin") redirect("/dashboard/crm");

  const salesUsers = await prisma.user.findMany({
    where: { is_active: true, role: { in: ["Sales", "Admin", "Manager"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">Revenue and profitability analysis</p>
      </div>
      <ReportsClient salesUsers={salesUsers} />
    </div>
  );
}
