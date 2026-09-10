import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { ImportHubClient } from "@/components/import/ImportHubClient";

// Admin-only central place to bulk-import Leads, Opportunities, Tasks, and Clients
// from Excel/CSV. Each tab is the shared ImportPanel driven by its entity config.
export default async function ImportHubPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "Admin") redirect("/dashboard/crm");

  return (
    <div className="p-3 sm:p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Import Hub"
        description="Bulk-import Leads, Opportunities, Tasks, and Clients from Excel or CSV. Download a template per entity, then upload up to 500 rows."
      />
      <Card>
        <CardContent className="pt-6">
          <ImportHubClient />
        </CardContent>
      </Card>
    </div>
  );
}
