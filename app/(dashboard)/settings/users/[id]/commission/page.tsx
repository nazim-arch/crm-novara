import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { hasPermission } from "@/lib/rbac";
import { CommissionSlabEditor } from "@/components/sales-commission/CommissionSlabEditor";
import { TrendingUp, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function UserCommissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "commission:manage")) redirect("/");

  const { id: userId } = await params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, is_active: true },
  });

  if (!user) notFound();

  const rawSlabs = await prisma.salesCommissionSlab.findMany({
    where: { user_id: userId },
    orderBy: [{ effective_from: "desc" }, { sort_order: "asc" }],
  });

  const batches = new Map<string, typeof rawSlabs>();
  for (const s of rawSlabs) {
    const group = batches.get(s.structure_id) ?? [];
    group.push(s);
    batches.set(s.structure_id, group);
  }

  const existingBatches = Array.from(batches.values()).map(rows => ({
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

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settings/users" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center">
          <TrendingUp className="h-5 w-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{user.name} — Commission Slabs</h1>
          <p className="text-sm text-gray-500">{user.role} · {user.is_active ? "Active" : "Inactive"}</p>
        </div>
      </div>

      <div className="border rounded-xl p-5">
        <CommissionSlabEditor userId={userId} existingBatches={existingBatches} />
      </div>
    </div>
  );
}
