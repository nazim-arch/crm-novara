import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { hasPermission } from "@/lib/rbac";
import { OpportunityForm } from "@/components/opportunities/OpportunityForm";

type Params = Promise<{ id: string }>;

export default async function EditOpportunityPage({ params }: { params: Params }) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "opportunity:update")) {
    redirect("/opportunities");
  }

  const { id } = await params;

  const opp = await prisma.opportunity.findUnique({ where: { id, deleted_at: null } });
  if (!opp) notFound();

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Edit Opportunity</h1>
        <p className="text-sm text-muted-foreground font-mono">{opp.opp_number}</p>
      </div>
      <OpportunityForm
        opportunityId={opp.id}
        defaultValues={{
          name: opp.name,
          project: opp.project,
          developer: opp.developer ?? undefined,
          sector: opp.sector ?? undefined,
          location: opp.location,
          property_type: opp.property_type,
          unit_types: opp.unit_types,
          price_min: opp.price_min ? Number(opp.price_min) : undefined,
          price_max: opp.price_max ? Number(opp.price_max) : undefined,
          commission_type: opp.commission_type,
          commission_value: Number(opp.commission_value),
          status: opp.status,
          notes: opp.notes ?? undefined,
        }}
      />
    </div>
  );
}
