import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/rbac";
import { AdminCommissionDashboard } from "@/components/sales-commission/AdminCommissionDashboard";
import { SalesCommissionDashboard } from "@/components/sales-commission/SalesCommissionDashboard";
import { DashboardFilters } from "@/components/podcast-studio/DashboardFilters";
import { resolveDateRange, monthsInRange, type DashboardRange } from "@/lib/date-range";
import { TrendingUp } from "lucide-react";
import { Suspense } from "react";

type SearchParams = Promise<{ range?: string; from?: string; to?: string }>;

function todayIST() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default async function SalesCommissionPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const canManage = hasPermission(session.user.role, "commission:manage");
  const canView = hasPermission(session.user.role, "commission:view");
  if (!canManage && !canView) redirect("/");

  const sp = await searchParams;
  const today = todayIST();
  const range = (sp.range ?? "current_month") as DashboardRange;
  const { start, end, label: rangeLabel } = resolveDateRange(range, today, sp.from, sp.to);
  const months = monthsInRange(start, end);
  const multiMonth = months.length > 1;

  // Admin: load commission records for all months in range
  let salesUsers: { id: string; name: string; short_name: string }[] = [];
  let initialRows: Parameters<typeof AdminCommissionDashboard>[0]["initialRows"] = [];

  if (canManage) {
    salesUsers = await prisma.user.findMany({
      where: { role: "Sales", is_active: true },
      select: { id: true, name: true, short_name: true },
      orderBy: { name: "asc" },
    });

    const records = await prisma.salesCommissionRecord.findMany({
      where: {
        OR: months.map(({ year, month }) => ({ year, month })),
      },
      include: {
        user: { select: { id: true, name: true, short_name: true } },
      },
      orderBy: [{ year: "asc" }, { month: "asc" }, { user: { name: "asc" } }],
    });

    initialRows = records.map(r => ({
      id: r.id,
      user_id: r.user_id,
      year: r.year,
      month: r.month,
      closed_revenue: Number(r.closed_revenue),
      leads_won: r.leads_won,
      target_amount: r.target_amount != null ? Number(r.target_amount) : null,
      achievement_pct: r.achievement_pct != null ? Number(r.achievement_pct) : null,
      commission_amount: r.commission_amount != null ? Number(r.commission_amount) : null,
      slab_pct: r.slab_pct != null ? Number(r.slab_pct) : null,
      rec_status: r.rec_status,
      user: r.user,
    }));
  }

  // Sales user: derive single month from range (use start date's month)
  const [startYear, startMonth] = start.split("-").map(Number);

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

      <Suspense>
        <DashboardFilters currentRange={range} currentFrom={sp.from} currentTo={sp.to} rangeLabel={rangeLabel} />
      </Suspense>

      {canManage ? (
        <AdminCommissionDashboard
          salesUsers={salesUsers}
          initialRows={initialRows}
          rangeLabel={rangeLabel}
          multiMonth={multiMonth}
        />
      ) : (
        <SalesCommissionDashboard
          userId={session.user.id}
          userName={session.user.name ?? ""}
          initialYear={startYear}
          initialMonth={startMonth}
        />
      )}
    </div>
  );
}
