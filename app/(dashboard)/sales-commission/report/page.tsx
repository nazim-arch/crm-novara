import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/rbac";
import { CommissionReport } from "@/components/sales-commission/CommissionReport";
import { BarChart3 } from "lucide-react";

export default async function CommissionReportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "commission:manage")) redirect("/");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
          <BarChart3 className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Commission Report</h1>
          <p className="text-sm text-gray-500">Full monthly breakdown — export to CSV</p>
        </div>
      </div>

      <CommissionReport />
    </div>
  );
}
