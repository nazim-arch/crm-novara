import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/rbac";
import { SalesCommissionDashboard } from "@/components/sales-commission/SalesCommissionDashboard";
import { AdminCommissionDashboard } from "@/components/sales-commission/AdminCommissionDashboard";
import { TrendingUp } from "lucide-react";

export default async function SalesCommissionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const canManage = hasPermission(session.user.role, "commission:manage");
  const canView = hasPermission(session.user.role, "commission:view");

  if (!canManage && !canView) redirect("/");

  // Admin: load all Sales users for leaderboard
  let salesUsers: { id: string; name: string; short_name: string }[] = [];
  if (canManage) {
    salesUsers = await prisma.user.findMany({
      where: { role: "Sales", is_active: true },
      select: { id: true, name: true, short_name: true },
      orderBy: { name: "asc" },
    });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center">
          <TrendingUp className="h-5 w-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {canManage ? "Commission Overview" : "My Commission"}
          </h1>
          <p className="text-sm text-gray-500">
            {canManage ? "All sales reps — live & finalized records" : `${session.user.name}'s monthly commission`}
          </p>
        </div>
      </div>

      {canManage ? (
        <AdminCommissionDashboard salesUsers={salesUsers} />
      ) : (
        <SalesCommissionDashboard
          userId={session.user.id}
          userName={session.user.name ?? ""}
        />
      )}
    </div>
  );
}
