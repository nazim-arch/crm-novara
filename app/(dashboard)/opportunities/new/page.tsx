import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/rbac";
import { OpportunityForm } from "@/components/opportunities/OpportunityForm";

export default async function NewOpportunityPage() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "opportunity:create")) {
    redirect("/opportunities");
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">New Opportunity</h1>
        <p className="text-sm text-muted-foreground">Add a new property opportunity</p>
      </div>
      <OpportunityForm />
    </div>
  );
}
