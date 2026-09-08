import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { hasPermissionAsync } from "@/lib/rbac";
import { Receipt } from "lucide-react";
import { DealClosuresClient } from "@/components/deal-closures/DealClosuresClient";

export default async function DealClosuresPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await hasPermissionAsync(session.user.role, "commission:reconcile"))) redirect("/");

  // Agent picker options for adding co-agents during reconciliation.
  const agents = await prisma.user.findMany({
    where: { is_active: true, role: { in: ["Sales", "TeamLead", "Manager", "Admin"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center">
          <Receipt className="h-5 w-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Deal Closures</h1>
          <p className="text-sm text-gray-500">
            Close Won deals — confirm the final settlement and agent commission payout.
          </p>
        </div>
      </div>

      <DealClosuresClient agents={agents} currentUserId={session.user.id} />
    </div>
  );
}
