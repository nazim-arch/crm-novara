import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/rbac";
import { MonthlyTargetManager } from "@/components/sales-commission/MonthlyTargetManager";
import { CommissionSlabEditor } from "@/components/sales-commission/CommissionSlabEditor";
import { Target } from "lucide-react";

export default async function CommissionTargetsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "commission:manage")) redirect("/");

  const salesUsers = await prisma.user.findMany({
    where: { role: "Sales", is_active: true },
    select: { id: true, name: true, short_name: true },
    orderBy: { name: "asc" },
  });

  const existingTargets = await prisma.salesMonthlyTarget.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  const firstUser = salesUsers[0];
  let existingSlabs: {
    structure_id: string;
    effective_from: string;
    slabs: {
      id: string;
      from_amount: number;
      to_amount: number | null;
      commission_pct: number;
      sort_order: number;
    }[];
  }[] = [];

  if (firstUser) {
    const rawSlabs = await prisma.salesCommissionSlab.findMany({
      where: { user_id: firstUser.id },
      orderBy: [{ effective_from: "desc" }, { sort_order: "asc" }],
    });
    const batches = new Map<string, typeof rawSlabs>();
    for (const s of rawSlabs) {
      const group = batches.get(s.structure_id) ?? [];
      group.push(s);
      batches.set(s.structure_id, group);
    }
    existingSlabs = Array.from(batches.values()).map(rows => ({
      structure_id: rows[0].structure_id,
      effective_from: rows[0].effective_from.toISOString(),
      slabs: rows.map(r => ({
        id: r.id,
        from_amount: Number(r.from_amount),
        to_amount: r.to_amount != null ? Number(r.to_amount) : null,
        commission_pct: Number(r.commission_pct),
        sort_order: r.sort_order,
      })),
    }));
  }

  const serializedTargets = existingTargets.map(t => ({
    ...t,
    target_amount: Number(t.target_amount),
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
          <Target className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Commission Setup</h1>
          <p className="text-sm text-gray-500">Set targets and slab structures per sales user</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">Monthly Targets</h2>
          <MonthlyTargetManager
            salesUsers={salesUsers}
            existingTargets={serializedTargets}
          />
        </div>

        <div className="border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">Commission Slabs</h2>
          <p className="text-xs text-gray-500">
            Select a sales user and manage their slab structure. Use the dropdown in targets to switch users.
          </p>
          {firstUser ? (
            <CommissionSlabEditor
              userId={firstUser.id}
              existingBatches={existingSlabs}
            />
          ) : (
            <p className="text-sm text-gray-400">No active Sales users found.</p>
          )}
        </div>
      </div>
    </div>
  );
}
