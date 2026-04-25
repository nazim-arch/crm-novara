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

  const opp = await prisma.opportunity.findUnique({
    where: { id, deleted_at: null },
    include: { configurations: { orderBy: { created_at: "asc" } } },
  });
  if (!opp) notFound();

  return (
    <div className="p-6 max-w-3xl mx-auto">
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
          opportunity_by: (opp.opportunity_by ?? "Developer") as "Developer" | "Seller" | "Buyer",
          location: opp.location,
          property_type: opp.property_type,
          commission_percent: Number(opp.commission_percent),
          status: opp.status,
          notes: opp.notes ?? undefined,
        }}
        existingConfigurations={opp.configurations.map((c) => ({
          id: c.id,
          label: c.label,
          number_of_units: c.number_of_units,
          price_per_unit: Number(c.price_per_unit),
          land_area: c.land_area != null ? Number(c.land_area) : null,
          area_unit: c.area_unit ?? null,
          sale_type: c.sale_type ?? null,
        }))}
      />
    </div>
  );
}
