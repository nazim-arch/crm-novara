import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadStatusBadge, TemperatureBadge } from "@/components/shared/LeadStatusBadge";
import { ArrowLeft, Edit } from "lucide-react";
import { hasPermission } from "@/lib/rbac";
import { ExpensesSection } from "@/components/opportunities/ExpensesSection";
import { DeleteConfirmButton } from "@/components/shared/DeleteConfirmButton";
import { FollowUpSection } from "@/components/follow-ups/FollowUpSection";


type Params = Promise<{ id: string }>;

function formatCurrency(n: number) {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export default async function OpportunityDetailPage({ params }: { params: Params }) {
  const session = await auth();
  const { id } = await params;

  const [opp, expenses, users] = await Promise.all([
    prisma.opportunity.findUnique({
      where: { id, deleted_at: null },
      include: {
        created_by: { select: { id: true, name: true } },
        configurations: { orderBy: { created_at: "asc" } },
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
                settlement_value: true,
                deal_commission_percent: true,
              },
            },
          },
          orderBy: { tagged_at: "desc" },
        },
        follow_ups: {
          include: {
            assigned_to: { select: { id: true, name: true } },
            created_by: { select: { id: true, name: true } },
          },
          orderBy: { scheduled_at: "asc" },
          take: 20,
        },
        _count: {
          select: {
            tasks: { where: { deleted_at: null } },
            follow_ups: true,
          },
        },
      },
    }),
    prisma.opportunityExpense.findMany({
      where: { opportunity_id: id },
      include: { added_by: { select: { id: true, name: true } } },
      orderBy: { expense_date: "desc" },
    }),
    session?.user && (session.user.role === "Admin" || session.user.role === "Manager")
      ? prisma.user.findMany({ where: { is_active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  if (!opp) notFound();

  const canEdit = session?.user && hasPermission(session.user.role, "opportunity:update");
  const canDelete = session?.user && hasPermission(session.user.role, "opportunity:delete");
  const isAdmin = session?.user.role === "Admin";
  const canViewFinancials = session?.user ? hasPermission(session.user.role, "financial:view") : false;
  const canAddExpense = session?.user ? (isAdmin || session.user.role === "Sales") : false;

  const totalSalesValue = Number(opp.total_sales_value ?? 0);
  const possibleRevenue = Number(opp.possible_revenue ?? 0);
  const closedRevenue = Number(opp.closed_revenue ?? 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
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
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="outline" size="sm" render={<Link href={`/opportunities/${id}/edit`} />}>
              <Edit className="h-4 w-4 mr-1" /> Edit
            </Button>
          )}
          {canDelete && (
            <DeleteConfirmButton
              label="Delete"
              confirmText={[
                `Delete "${opp.name}"? This cannot be undone.`,
                opp._count.tasks > 0 && `${opp._count.tasks} linked task${opp._count.tasks !== 1 ? "s" : ""} will also be deleted.`,
                opp._count.follow_ups > 0 && `${opp._count.follow_ups} follow-up${opp._count.follow_ups !== 1 ? "s" : ""} will also be deleted.`,
                expenses.length > 0 && `${expenses.length} expense record${expenses.length !== 1 ? "s" : ""} will also be deleted.`,
              ].filter(Boolean).join(" ")}
              apiPath={`/api/opportunities/${id}`}
              redirectTo="/opportunities"
            />
          )}
        </div>
      </div>

      {/* Financial Summary */}
      {canViewFinancials && (
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border bg-card">
            <p className="text-xs text-muted-foreground mb-1">Total Sales Value</p>
            <p className="text-xl font-semibold">
              {totalSalesValue > 0 ? formatCurrency(totalSalesValue) : "—"}
            </p>
          </div>
          <div className="p-4 rounded-lg border bg-primary/5 border-primary/20">
            <p className="text-xs text-muted-foreground mb-1">Possible Revenue</p>
            <p className="text-xl font-semibold text-primary">
              {possibleRevenue > 0 ? formatCurrency(possibleRevenue) : "—"}
            </p>
            {canViewFinancials && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {Number(opp.commission_percent)}% commission
              </p>
            )}
          </div>
          <div className="p-4 rounded-lg border bg-green-500/5 border-green-500/20">
            <p className="text-xs text-muted-foreground mb-1">Closed Revenue</p>
            <p className="text-xl font-semibold text-green-600">
              {closedRevenue > 0 ? formatCurrency(closedRevenue) : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">From Won deals</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoItem label="Project" value={opp.project} />
                <InfoItem label="Developer" value={opp.developer} />
                <InfoItem label="Opportunity By" value={opp.opportunity_by ?? "Developer"} />
                <InfoItem label="Location" value={opp.location} />
                <InfoItem label="Property Type" value={opp.property_type} />
                {canViewFinancials && <InfoItem label="Commission" value={`${Number(opp.commission_percent)}%`} />}
                <InfoItem label="Status" value={opp.status} />
                <InfoItem label="Created by" value={opp.created_by.name} />
              </div>
              {opp.notes && (
                <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{opp.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Configurations Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                {opp.property_type === "Land" ? "Land Parcels" : "Inventory / Configurations"} ({opp.configurations.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {opp.configurations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No configurations added</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-2 pr-4">Label</th>
                        {opp.property_type === "Land" ? (
                          <>
                            <th className="text-right py-2 px-4">Area</th>
                            <th className="text-right py-2 px-4">Unit</th>
                            <th className="text-right py-2 px-4">Sale Type</th>
                          </>
                        ) : (
                          <th className="text-right py-2 px-4">Units</th>
                        )}
                        <th className="text-right py-2 px-4">Price / Unit</th>
                        <th className="text-right py-2 pl-4">Row Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {opp.configurations.map((cfg) => (
                        <tr key={cfg.id} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium">{cfg.label}</td>
                          {opp.property_type === "Land" ? (
                            <>
                              <td className="py-2 px-4 text-right">{cfg.land_area != null ? Number(cfg.land_area) : "—"}</td>
                              <td className="py-2 px-4 text-right">{cfg.area_unit ?? "—"}</td>
                              <td className="py-2 px-4 text-right">{cfg.sale_type === "ForSale" ? "For Sale" : cfg.sale_type ?? "—"}</td>
                            </>
                          ) : (
                            <td className="py-2 px-4 text-right">{cfg.number_of_units}</td>
                          )}
                          <td className="py-2 px-4 text-right">
                            {formatCurrency(Number(cfg.price_per_unit))}
                          </td>
                          <td className="py-2 pl-4 text-right font-medium">
                            {formatCurrency(Number(cfg.row_total))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2">
                        <td colSpan={opp.property_type === "Land" ? 5 : 3} className="py-2 pr-4 text-right text-muted-foreground text-xs font-medium">
                          Total Sales Value
                        </td>
                        <td className="py-2 pl-4 text-right font-semibold">
                          {totalSalesValue > 0 ? formatCurrency(totalSalesValue) : "—"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Expenses — visible to Admin and Sales; financial summary only to Admin */}
          {canAddExpense && (
            <ExpensesSection
              opportunityId={id}
              expenses={expenses.map((e) => ({
                ...e,
                amount: Number(e.amount),
              }))}
              possibleRevenue={possibleRevenue}
              closedRevenue={closedRevenue}
              currentUserId={session?.user.id ?? ""}
              isAdmin={isAdmin}
              canViewFinancials={canViewFinancials}
            />
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Follow-ups */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Follow-ups</CardTitle>
            </CardHeader>
            <CardContent>
              <FollowUpSection
                entityType="opportunity"
                entityId={opp.id}
                initialFollowUps={opp.follow_ups}
                users={users}
                currentUserId={session?.user.id ?? ""}
                canManage={!!canEdit}
                isAdmin={isAdmin}
              />
            </CardContent>
          </Card>

          {/* Tagged Leads */}
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
                opp.leads.map(({ lead }) => {
                  const commission =
                    lead.settlement_value && lead.deal_commission_percent
                      ? (Number(lead.settlement_value) * Number(lead.deal_commission_percent)) / 100
                      : null;
                  return (
                    <Link
                      key={lead.id}
                      href={`/leads/${lead.id}`}
                      className="block p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                    >
                      <p className="font-medium text-sm">{lead.full_name}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground font-mono">
                          {lead.lead_number}
                        </span>
                        <LeadStatusBadge status={lead.status} />
                        <TemperatureBadge temperature={lead.temperature} />
                      </div>
                      {commission !== null && canViewFinancials && (
                        <p className="text-xs text-green-600 mt-1 font-medium">
                          Commission: {formatCurrency(commission)}
                        </p>
                      )}
                    </Link>
                  );
                })
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
