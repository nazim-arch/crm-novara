import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadStatusBadge, TemperatureBadge } from "@/components/shared/LeadStatusBadge";
import { formatCurrency } from "@/lib/utils";
import { ArrowLeft, Edit } from "lucide-react";
import { hasPermission } from "@/lib/rbac";

type Params = Promise<{ id: string }>;

export default async function OpportunityDetailPage({ params }: { params: Params }) {
  const session = await auth();
  const { id } = await params;

  const opp = await prisma.opportunity.findUnique({
    where: { id, deleted_at: null },
    include: {
      created_by: { select: { id: true, name: true } },
      leads: {
        include: {
          lead: {
            select: {
              id: true,
              lead_number: true,
              full_name: true,
              phone: true,
              status: true,
              temperature: true,
            },
          },
        },
        orderBy: { tagged_at: "desc" },
      },
    },
  });

  if (!opp) notFound();

  const canEdit = session?.user && hasPermission(session.user.role, "opportunity:update");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" render={<Link href="/opportunities" />}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{opp.name}</h1>
            <p className="text-sm text-muted-foreground font-mono">{opp.opp_number}</p>
          </div>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" render={<Link href={`/opportunities/${id}/edit`} />}>
            <Edit className="h-4 w-4 mr-1" />Edit
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoItem label="Project" value={opp.project} />
                <InfoItem label="Developer" value={opp.developer} />
                <InfoItem label="Location" value={opp.location} />
                <InfoItem label="Sector" value={opp.sector} />
                <InfoItem label="Property Type" value={opp.property_type} />
                <InfoItem label="Unit Types" value={opp.unit_types.join(", ")} />
                <InfoItem
                  label="Price Range"
                  value={
                    opp.price_min || opp.price_max
                      ? `${opp.price_min ? formatCurrency(Number(opp.price_min)) : "?"} – ${opp.price_max ? formatCurrency(Number(opp.price_max)) : "?"}`
                      : undefined
                  }
                />
                <InfoItem
                  label="Commission"
                  value={
                    opp.commission_type === "Percentage"
                      ? `${opp.commission_value}%`
                      : formatCurrency(Number(opp.commission_value))
                  }
                />
                <InfoItem label="Status" value={opp.status} />
              </div>
              {opp.notes && (
                <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{opp.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                Tagged Leads ({opp.leads.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {opp.leads.length === 0 ? (
                <p className="text-sm text-muted-foreground">No leads tagged yet</p>
              ) : (
                opp.leads.map(({ lead }) => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="block p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                  >
                    <p className="font-medium text-sm">{lead.full_name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs text-muted-foreground font-mono">{lead.lead_number}</span>
                      <LeadStatusBadge status={lead.status} />
                      <TemperatureBadge temperature={lead.temperature} />
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
