import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { canViewHidden } from "@/lib/lead-visibility";
import { hasPermissionAsync } from "@/lib/rbac";
import { PageHeader } from "@/components/shared/PageHeader";
import { LeadStatusBadge } from "@/components/shared/LeadStatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReleaseLeadAction } from "@/components/leads/ReleaseLeadAction";

// Lead-level hidden statuses + Lost make up the "release pool" (see lib/lead-visibility).
const POOL_STATUSES = ["Recycle", "InvalidLead", "Lost"] as const;

export default async function RecyclePoolPage() {
  const session = await auth();
  if (!session?.user) redirect("/dashboard/crm");

  // Only roles that bypass lead visibility (Admin, or a role holding lead:view_hidden) may see the pool.
  if (!(await canViewHidden(session.user.role))) redirect("/leads");

  const canRelease = await hasPermissionAsync(session.user.role, "lead:release_recycled");

  const [leads, agents] = await Promise.all([
    prisma.lead.findMany({
      where: { status: { in: POOL_STATUSES as unknown as never } },
      orderBy: { updated_at: "desc" },
      select: {
        id: true,
        lead_number: true,
        full_name: true,
        phone: true,
        city: true,
        status: true,
        updated_at: true,
        assigned_to: { select: { name: true } },
      },
      take: 500,
    }),
    prisma.user.findMany({
      where: { is_active: true, role: { not: "Viewer" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Hidden / Recycle pool"
        description="Leads hidden from agents — recycled, invalid, or lost at the lead level. Release a lead to hand it back to an agent; earned (Booked/Won) leads never appear here."
      />

      {leads.length === 0 ? (
        <div className="rounded-lg border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          The recycle pool is empty.
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last assignee</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                      {lead.full_name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{lead.lead_number}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{lead.city ?? "—"}</TableCell>
                  <TableCell>
                    <LeadStatusBadge status={lead.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.assigned_to?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {lead.updated_at.toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {canRelease ? (
                      <ReleaseLeadAction
                        leadId={lead.id}
                        leadNumber={lead.lead_number}
                        agents={agents}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">View only</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
