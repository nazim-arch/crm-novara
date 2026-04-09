import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeadStatusBadge, TemperatureBadge } from "@/components/shared/LeadStatusBadge";
import { formatDate } from "@/lib/utils";
import { startOfDay, endOfDay } from "date-fns";
import { Clock, AlertTriangle } from "lucide-react";

export default async function FollowUpsPage() {
  const session = await auth();

  const isSales = session?.user.role === "Sales";
  const userFilter = isSales ? { assigned_to_id: session?.user.id } : {};

  const today = new Date();

  const [todayLeads, overdueLeads, hotLeads] = await Promise.all([
    prisma.lead.findMany({
      where: {
        deleted_at: null,
        ...userFilter,
        status: { notIn: ["Won", "Lost", "Recycle"] },
        next_followup_date: {
          gte: startOfDay(today),
          lte: endOfDay(today),
        },
      },
      include: { assigned_to: { select: { id: true, name: true } } },
      orderBy: { next_followup_date: "asc" },
      take: 50,
    }),
    prisma.lead.findMany({
      where: {
        deleted_at: null,
        ...userFilter,
        status: { notIn: ["Won", "Lost", "Recycle"] },
        next_followup_date: { lt: startOfDay(today) },
      },
      include: { assigned_to: { select: { id: true, name: true } } },
      orderBy: { next_followup_date: "asc" },
      take: 50,
    }),
    prisma.lead.findMany({
      where: {
        deleted_at: null,
        ...userFilter,
        temperature: "Hot",
        status: { notIn: ["Won", "Lost", "Recycle"] },
      },
      include: { assigned_to: { select: { id: true, name: true } } },
      orderBy: { next_followup_date: "asc" },
      take: 50,
    }),
  ]);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Follow-ups</h1>
        <p className="text-sm text-muted-foreground">
          {todayLeads.length} due today · {overdueLeads.length} overdue · {hotLeads.length} hot leads
        </p>
      </div>

      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today">
            <Clock className="h-3.5 w-3.5 mr-1" />
            Today ({todayLeads.length})
          </TabsTrigger>
          <TabsTrigger value="overdue">
            <AlertTriangle className="h-3.5 w-3.5 mr-1" />
            Overdue ({overdueLeads.length})
          </TabsTrigger>
          <TabsTrigger value="hot">
            Hot Leads ({hotLeads.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today">
          <LeadTable leads={todayLeads} emptyText="No follow-ups due today" />
        </TabsContent>
        <TabsContent value="overdue">
          <LeadTable leads={overdueLeads} emptyText="No overdue follow-ups" highlight />
        </TabsContent>
        <TabsContent value="hot">
          <LeadTable leads={hotLeads} emptyText="No hot leads" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type Lead = {
  id: string;
  lead_number: string;
  full_name: string;
  phone: string;
  status: string;
  temperature: string;
  next_followup_date: Date | null;
  followup_type: string | null;
  assigned_to: { id: string; name: string };
};

function LeadTable({
  leads,
  emptyText,
  highlight,
}: {
  leads: Lead[];
  emptyText: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden mt-2">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>Lead</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Temp</TableHead>
            <TableHead>Follow-up Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Assigned To</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                {emptyText}
              </TableCell>
            </TableRow>
          ) : (
            leads.map((lead) => (
              <TableRow key={lead.id} className="hover:bg-muted/30">
                <TableCell>
                  <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                    {lead.full_name}
                  </Link>
                  <p className="text-xs text-muted-foreground font-mono">{lead.lead_number}</p>
                </TableCell>
                <TableCell className="text-sm">{lead.phone}</TableCell>
                <TableCell><LeadStatusBadge status={lead.status} /></TableCell>
                <TableCell><TemperatureBadge temperature={lead.temperature} /></TableCell>
                <TableCell className={`text-sm ${highlight ? "text-destructive font-medium" : ""}`}>
                  {formatDate(lead.next_followup_date)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{lead.followup_type ?? "—"}</TableCell>
                <TableCell className="text-sm">{lead.assigned_to.name}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
