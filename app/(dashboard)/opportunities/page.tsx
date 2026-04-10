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
import { hasPermission } from "@/lib/rbac";

type SearchParams = Promise<{ status?: string; search?: string; page?: string }>;

function formatCurrency(n: number) {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export default async function OpportunitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  const sp = await searchParams;

  const page = Math.max(1, Number(sp.page ?? "1"));
  const limit = 20;

  const where = {
    deleted_at: null as null,
    ...(sp.status && sp.status !== "all" && { status: sp.status as "Active" | "Inactive" | "Sold" }),
    ...(sp.search && {
      OR: [
        { name: { contains: sp.search, mode: "insensitive" as const } },
        { project: { contains: sp.search, mode: "insensitive" as const } },
        { location: { contains: sp.search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [total, opportunities] = await Promise.all([
    prisma.opportunity.count({ where }),
    prisma.opportunity.findMany({
      where,
      include: {
        created_by: { select: { id: true, name: true } },
        _count: { select: { leads: true } },
      },
      orderBy: { updated_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const canCreate = session?.user && hasPermission(session.user.role, "opportunity:create");

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Opportunities</h1>
          <p className="text-sm text-muted-foreground">{total} total</p>
        </div>
        {canCreate && (
          <Button render={<Link href="/opportunities/new" />}>
            <Plus className="h-4 w-4 mr-1" />
            New Opportunity
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>ID</TableHead>
              <TableHead>Name / Project</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Possible Revenue</TableHead>
              <TableHead>Leads</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {opportunities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No opportunities yet
                </TableCell>
              </TableRow>
            ) : (
              opportunities.map((opp) => (
                <TableRow key={opp.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {opp.opp_number}
                  </TableCell>
                  <TableCell>
                    <Link href={`/opportunities/${opp.id}`} className="font-medium hover:underline">
                      {opp.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{opp.project}</p>
                  </TableCell>
                  <TableCell className="text-sm">{opp.location}</TableCell>
                  <TableCell className="text-sm">{opp.property_type}</TableCell>
                  <TableCell className="text-sm">{Number(opp.commission_percent)}%</TableCell>
                  <TableCell className="text-sm">
                    {opp.possible_revenue ? formatCurrency(Number(opp.possible_revenue)) : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{opp._count.leads}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        opp.status === "Active"
                          ? "bg-green-100 text-green-700"
                          : opp.status === "Sold"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {opp.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
