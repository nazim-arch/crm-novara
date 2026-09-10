import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { ReportBuilderClient } from "@/components/reports/builder/ReportBuilderClient";

// Admin-only custom report builder. Personal saved reports.
export default async function ReportBuilderPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "Admin") redirect("/dashboard/crm");

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Report Builder"
        description="Compose filters, columns, grouping and aggregations over any entity, preview live, save, and export to Excel."
      />
      <ReportBuilderClient />
    </div>
  );
}
