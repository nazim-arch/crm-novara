import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Building2 } from "lucide-react";
import { hasPermissionAsync } from "@/lib/rbac";
import { ExportButton } from "@/components/shared/ExportButton";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { ColumnFilterHeader } from "@/components/shared/ColumnFilterHeader";
import { OppFilters } from "@/components/opportunities/OppFilters";
import type { Prisma, PropertyType } from "@/lib/generated/prisma/client";

const OPP_STATUS_OPTIONS = [
  { label: "Active", value: "Active" },
  { label: "Inactive", value: "Inactive" },
  { label: "Sold", value: "Sold" },
];

const OPP_PROPERTY_TYPE_OPTIONS = [
  { label: "Residential", value: "Residential" },
  { label: "Commercial", value: "Commercial" },
  { label: "Plot", value: "Plot" },
  { label: "Villa", value: "Villa" },
  { label: "Apartment", value: "Apartment" },
  { label: "Office", value: "Office" },
  { label: "Land", value: "Land" },
];

const OPP_BY_OPTIONS = [
  { label: "Developer", value: "Developer" },
  { label: "Seller", value: "Seller" },
  { label: "Buyer", value: "Buyer" },
];

type SearchParams = Promise<{ status?: string; search?: string; page?: string; sort?: string; dir?: string; property_type?: string; opportunity_by?: string }>;

function formatCurrency(n: number) {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

const SORT_MAP: Record<string, Prisma.OpportunityOrderByWithRelationInput> = {
  name:            { name: "asc" },
  location:        { location: "asc" },
  property_type:   { property_type: "asc" },
  status:          { status: "asc" },
  commission_percent:  { commission_percent: "asc" },
  possible_revenue:    { possible_revenue: "asc" },
  created_at:      { created_at: "asc" },
};

export default async function OpportunitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  const sp = await searchParams;
  const canExport = session?.user ? await hasPermissionAsync(session.user.role, "opportunity:export") : false;

  const page = Math.max(1, Number(sp.page ?? "1"));
  const limit = 20;
  const sortCol = sp.sort ?? "created_at";
  const sortDir = sp.dir === "asc" ? "asc" : "desc";

  const where = {
    deleted_at: null as null,
    ...(sp.status && sp.status !== "all" && { status: sp.status as "Active" | "Inactive" | "Sold" }),
    ...(sp.property_type && sp.property_type !== "all" && { property_type: sp.property_type as PropertyType }),
    ...(sp.opportunity_by && sp.opportunity_by !== "all" && { opportunity_by: sp.opportunity_by as "Developer" | "Seller" | "Buyer" }),
    ...(sp.search && {
      OR: [
        { name: { contains: sp.search, mode: "insensitive" as const } },
        { project: { contains: sp.search, mode: "insensitive" as const } },
        { location: { contains: sp.search, mode: "insensitive" as const } },
      ],
    }),
  };

  const baseOrder = SORT_MAP[sortCol] ?? { created_at: "asc" };
  const orderBy = Object.fromEntries(
    Object.entries(baseOrder).map(([k]) => [k, sortDir])
  ) as Prisma.OpportunityOrderByWithRelationInput;

  const [total, opportunities] = await Promise.all([
    prisma.opportunity.count({ where }),
    prisma.opportunity.findMany({
      where,
      include: {
        created_by: { select: { id: true, name: true } },
        _count: { select: { leads: true } },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const canCreate = session?.user && await hasPermissionAsync(session.user.role, "opportunity:create");
  const canViewFinancials = session?.user && await hasPermissionAsync(session.user.role, "financial:view");

  const sh = (col: string, label: string) => (
    <SortableHeader column={col} label={label} currentSort={sortCol} currentDir={sortDir} />
  );

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold">Opportunities</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">{total} total</p>
        </div>
        <div className="flex items-center gap-1.5">
          {canExport && <ExportButton href="/api/opportunities/export" filename="opportunities.xlsx" />}
          {canCreate && (
            <Button render={<Link href="/opportunities/new" />} size="sm">
              <Plus className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">New Opportunity</span>
            </Button>
          )}
        </div>
      </div>

      <OppFilters currentSearch={sp.search} currentStatus={sp.status} />

      {/* Mobile card view */}
      <div className="md:hidden space-y-2">
        {opportunities.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No opportunities yet
          </div>
        ) : (
          opportunities.map((opp) => (
            <div key={opp.id} className="rounded-xl border bg-card p-3 space-y-2 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/opportunities/${opp.id}`} className="font-semibold text-sm hover:underline block truncate">
                    {opp.name}
                  </Link>
                  <p className="text-xs text-muted-foreground truncate">{opp.project}</p>
                  <span className="text-[11px] text-muted-foreground font-mono">{opp.opp_number}</span>
                </div>
                <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  opp.status === "Active" ? "bg-green-100 text-green-700"
                  : opp.status === "Sold" ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600"
                }`}>
                  {opp.status}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{opp.location}</span>
                <span>{opp.property_type}</span>
                <span>{opp._count.leads} lead{opp._count.leads !== 1 ? "s" : ""}</span>
                {canViewFinancials && opp.possible_revenue && (
                  <span className="font-medium text-foreground">{formatCurrency(Number(opp.possible_revenue))}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>ID</TableHead>
              <TableHead>{sh("name", "Name / Project")}</TableHead>
              <TableHead>{sh("location", "Location")}</TableHead>
              <TableHead>
                <ColumnFilterHeader
                  column="property_type"
                  label="Type"
                  currentSort={sortCol}
                  currentDir={sortDir}
                  filterParam="property_type"
                  filterOptions={OPP_PROPERTY_TYPE_OPTIONS}
                  currentFilter={sp.property_type}
                />
              </TableHead>
              <TableHead>
                <ColumnFilterHeader
                  label="Opp By"
                  filterParam="opportunity_by"
                  filterOptions={OPP_BY_OPTIONS}
                  currentFilter={sp.opportunity_by}
                />
              </TableHead>
              {canViewFinancials && <TableHead>{sh("commission_percent", "Commission")}</TableHead>}
              {canViewFinancials && <TableHead>{sh("possible_revenue", "Possible Revenue")}</TableHead>}
              <TableHead>Leads</TableHead>
              <TableHead>
                <ColumnFilterHeader
                  column="status"
                  label="Status"
                  currentSort={sortCol}
                  currentDir={sortDir}
                  filterParam="status"
                  filterOptions={OPP_STATUS_OPTIONS}
                  currentFilter={sp.status}
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {opportunities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canViewFinancials ? 9 : 7} className="text-center py-12 text-muted-foreground">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No opportunities yet
                </TableCell>
              </TableRow>
            ) : (
              opportunities.map((opp) => (
                <TableRow key={opp.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono text-xs text-muted-foreground">{opp.opp_number}</TableCell>
                  <TableCell>
                    <Link href={`/opportunities/${opp.id}`} className="font-medium hover:underline">
                      {opp.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{opp.project}</p>
                  </TableCell>
                  <TableCell className="text-sm">{opp.location}</TableCell>
                  <TableCell className="text-sm">{opp.property_type}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{opp.opportunity_by ?? "Developer"}</TableCell>
                  {canViewFinancials && <TableCell className="text-sm">{Number(opp.commission_percent)}%</TableCell>}
                  {canViewFinancials && (
                    <TableCell className="text-sm">
                      {opp.possible_revenue ? formatCurrency(Number(opp.possible_revenue)) : "—"}
                    </TableCell>
                  )}
                  <TableCell className="text-sm">{opp._count.leads}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      opp.status === "Active" ? "bg-green-100 text-green-700"
                      : opp.status === "Sold" ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-600"
                    }`}>
                      {opp.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs sm:text-sm text-muted-foreground">
          <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Button variant="outline" size="sm" render={<Link href={`/opportunities?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]), page: String(page - 1) })}`} />}>
                Previous
              </Button>
            )}
            {page < totalPages && (
              <Button variant="outline" size="sm" render={<Link href={`/opportunities?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]), page: String(page + 1) })}`} />}>
                Next
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
