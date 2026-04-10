import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LeadStatusBadge, TemperatureBadge } from "@/components/shared/LeadStatusBadge";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus } from "lucide-react";
import type { Prisma } from "@/lib/generated/prisma/client";
import { LeadFilters } from "@/components/leads/LeadFilters";

type SearchParams = Promise<{
  status?: string;
  temperature?: string;
  assigned_to?: string;
  search?: string;
  page?: string;
}>;

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  const sp = await searchParams;

  const page = Math.max(1, Number(sp.page ?? "1"));
  const limit = 20;

  const where: Prisma.LeadWhereInput = {
    deleted_at: null,
    ...(sp.status && sp.status !== "all" && { status: sp.status as Prisma.EnumLeadStatusFilter }),
    ...(sp.temperature && sp.temperature !== "all" && { temperature: sp.temperature as Prisma.EnumLeadTemperatureFilter }),
    ...(sp.assigned_to && sp.assigned_to !== "all" && { assigned_to_id: sp.assigned_to }),
    ...(sp.search && {
      OR: [
        { full_name: { contains: sp.search, mode: "insensitive" } },
        { phone: { contains: sp.search } },
        { lead_number: { contains: sp.search, mode: "insensitive" } },
      ],
    }),
  };

  if (session?.user.role === "Sales") {
    where.OR = [
      { assigned_to_id: session.user.id },
      { lead_owner_id: session.user.id },
      { created_by_id: session.user.id },
    ];
  }

  const [total, leads, users] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      include: {
        assigned_to: { select: { id: true, name: true } },
      },
      orderBy: { updated_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.findMany({
      where: { is_active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Leads</h1>
          <p className="text-sm text-muted-foreground">{total} total leads</p>
        </div>
        <Button render={<Link href="/leads/new" />}>
          <Plus className="h-4 w-4 mr-1" />
          New Lead
        </Button>
      </div>

      {/* Filters */}
      <LeadFilters users={users} currentParams={sp} />

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-32">Lead ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Temp</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Property Type</TableHead>
              <TableHead>Follow-up</TableHead>
              <TableHead className="text-right">Pipeline Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  No leads found
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow key={lead.id} className="hover:bg-muted/30 cursor-pointer">
                  <TableCell>
                    <Link
                      href={`/leads/${lead.id}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {lead.lead_number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                      {lead.full_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{lead.phone}</TableCell>
                  <TableCell>
                    <LeadStatusBadge status={lead.status} />
                  </TableCell>
                  <TableCell>
                    <TemperatureBadge temperature={lead.temperature} />
                  </TableCell>
                  <TableCell className="text-sm">{lead.assigned_to.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{lead.property_type ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.next_followup_date ? (
                      <span
                        className={
                          new Date(lead.next_followup_date) < new Date()
                            ? "text-destructive font-medium"
                            : ""
                        }
                      >
                        {formatDate(lead.next_followup_date)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {lead.potential_lead_value
                      ? formatCurrency(Number(lead.potential_lead_value))
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Button
                variant="outline"
                size="sm"
                render={<Link href={`/leads?${new URLSearchParams({ ...sp, page: String(page - 1) })}`} />}
              >
                Previous
              </Button>
            )}
            {page < totalPages && (
              <Button
                variant="outline"
                size="sm"
                render={<Link href={`/leads?${new URLSearchParams({ ...sp, page: String(page + 1) })}`} />}
              >
                Next
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
