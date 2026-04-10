"use client";

import { useState, useMemo } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LeadStatusBadge, TemperatureBadge } from "@/components/shared/LeadStatusBadge";
import { formatDate } from "@/lib/utils";
import { startOfDay, endOfDay, addDays, differenceInCalendarDays } from "date-fns";
import {
  Phone,
  Mail,
  MessageCircle,
  Home,
  Users,
  Zap,
  AlertTriangle,
  Clock,
  Flame,
  CalendarX,
  Search,
} from "lucide-react";

export type FollowUpLead = {
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

interface FollowUpsClientProps {
  leads: FollowUpLead[];
  users: { id: string; name: string }[];
  isManagerOrAdmin: boolean;
  currentUserId: string;
}

// ── Relative date display ────────────────────────────────────────
function getRelative(date: Date | null): { label: string; cls: string } {
  if (!date) return { label: "No date", cls: "text-muted-foreground" };
  const today = startOfDay(new Date());
  const diff = differenceInCalendarDays(startOfDay(date), today);
  if (diff < -1) return { label: `${Math.abs(diff)}d overdue`, cls: "text-destructive font-medium" };
  if (diff === -1) return { label: "Yesterday", cls: "text-destructive font-medium" };
  if (diff === 0) return { label: "Today", cls: "text-orange-600 font-medium" };
  if (diff === 1) return { label: "Tomorrow", cls: "text-yellow-600 font-medium" };
  return { label: `in ${diff} days`, cls: "text-muted-foreground" };
}

// ── Follow-up type icon ──────────────────────────────────────────
function FuTypeIcon({ type }: { type: string | null }) {
  switch (type) {
    case "Call":
      return <Phone className="h-3.5 w-3.5 text-green-600 shrink-0" />;
    case "Email":
      return <Mail className="h-3.5 w-3.5 text-blue-600 shrink-0" />;
    case "WhatsApp":
      return <MessageCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />;
    case "Visit":
      return <Home className="h-3.5 w-3.5 text-orange-500 shrink-0" />;
    case "Meeting":
      return <Users className="h-3.5 w-3.5 text-purple-600 shrink-0" />;
    case "Activity":
      return <Zap className="h-3.5 w-3.5 text-yellow-500 shrink-0" />;
    default:
      return null;
  }
}

// ── Main component ───────────────────────────────────────────────
export function FollowUpsClient({
  leads,
  users,
  isManagerOrAdmin,
  currentUserId,
}: FollowUpsClientProps) {
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");

  const today = useMemo(() => startOfDay(new Date()), []);

  // Apply search + assignee filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return leads.filter((l) => {
      if (assigneeFilter !== "all" && l.assigned_to.id !== assigneeFilter) return false;
      if (q && !l.full_name.toLowerCase().includes(q) && !l.phone.includes(q)) return false;
      return true;
    });
  }, [leads, search, assigneeFilter]);

  // Split into tab buckets
  const buckets = useMemo(() => {
    const overdue: FollowUpLead[] = [];
    const todayLeads: FollowUpLead[] = [];
    const next3: FollowUpLead[] = [];
    const next7: FollowUpLead[] = [];
    const next30: FollowUpLead[] = [];
    const hot: FollowUpLead[] = [];
    const noDate: FollowUpLead[] = [];

    const end3 = endOfDay(addDays(today, 3));
    const end7 = endOfDay(addDays(today, 7));
    const end30 = endOfDay(addDays(today, 30));
    const todayEnd = endOfDay(today);

    for (const lead of filtered) {
      if (lead.temperature === "Hot") hot.push(lead);

      if (!lead.next_followup_date) {
        noDate.push(lead);
        continue;
      }

      const d = new Date(lead.next_followup_date);
      if (d < today) {
        overdue.push(lead);
      } else if (d <= todayEnd) {
        todayLeads.push(lead);
      } else if (d <= end3) {
        next3.push(lead);
      } else if (d <= end7) {
        next7.push(lead);
      } else if (d <= end30) {
        next30.push(lead);
      }
    }

    return { overdue, today: todayLeads, next3, next7, next30, all: filtered, hot, noDate };
  }, [filtered, today]);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Follow-ups</h1>
          <p className="text-sm text-muted-foreground">
            {buckets.overdue.length > 0 && (
              <span className="text-destructive font-medium">
                {buckets.overdue.length} overdue ·{" "}
              </span>
            )}
            {buckets.today.length} today · {buckets.next7.length} next 7 days · {filtered.length} total active
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 w-52 text-sm"
            />
          </div>
          {isManagerOrAdmin && (
            <Select value={assigneeFilter} onValueChange={(v) => v && setAssigneeFilter(v)}>
              <SelectTrigger className="h-8 w-44 text-sm">
                <SelectValue placeholder="All assignees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assignees</SelectItem>
                <SelectItem value={currentUserId}>My leads</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overdue">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overdue" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Overdue
            {buckets.overdue.length > 0 && (
              <span className="ml-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0">
                {buckets.overdue.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="today" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Today ({buckets.today.length})
          </TabsTrigger>
          <TabsTrigger value="next3">
            Next 3 Days ({buckets.next3.length})
          </TabsTrigger>
          <TabsTrigger value="next7">
            Next 7 Days ({buckets.next7.length})
          </TabsTrigger>
          <TabsTrigger value="next30">
            Next 30 Days ({buckets.next30.length})
          </TabsTrigger>
          <TabsTrigger value="all">
            All Active ({buckets.all.length})
          </TabsTrigger>
          <TabsTrigger value="hot" className="gap-1.5">
            <Flame className="h-3.5 w-3.5 text-orange-500" />
            Hot Leads ({buckets.hot.length})
          </TabsTrigger>
          <TabsTrigger value="nodate" className="gap-1.5">
            <CalendarX className="h-3.5 w-3.5" />
            No Date Set ({buckets.noDate.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overdue">
          <LeadTable leads={buckets.overdue} emptyText="No overdue follow-ups" rowStyle="overdue" />
        </TabsContent>
        <TabsContent value="today">
          <LeadTable leads={buckets.today} emptyText="No follow-ups due today" rowStyle="today" />
        </TabsContent>
        <TabsContent value="next3">
          <LeadTable leads={buckets.next3} emptyText="No follow-ups in the next 3 days" />
        </TabsContent>
        <TabsContent value="next7">
          <LeadTable leads={buckets.next7} emptyText="No follow-ups in the next 7 days" />
        </TabsContent>
        <TabsContent value="next30">
          <LeadTable leads={buckets.next30} emptyText="No follow-ups in the next 30 days" />
        </TabsContent>
        <TabsContent value="all">
          <LeadTable leads={buckets.all} emptyText="No active leads" />
        </TabsContent>
        <TabsContent value="hot">
          <LeadTable leads={buckets.hot} emptyText="No hot leads" />
        </TabsContent>
        <TabsContent value="nodate">
          <div className="mb-2 mt-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
            These leads have no follow-up date scheduled. Set a follow-up to keep them from falling through the cracks.
          </div>
          <LeadTable leads={buckets.noDate} emptyText="All active leads have a follow-up date set" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Lead table ───────────────────────────────────────────────────
function LeadTable({
  leads,
  emptyText,
  rowStyle,
}: {
  leads: FollowUpLead[];
  emptyText: string;
  rowStyle?: "overdue" | "today";
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
            leads.map((lead) => {
              const relative = getRelative(lead.next_followup_date);

              // Row tint based on urgency
              let rowCls = "hover:bg-muted/30";
              if (rowStyle === "overdue" || (!lead.next_followup_date ? false : new Date(lead.next_followup_date) < startOfDay(new Date()))) {
                rowCls = "bg-red-50/40 hover:bg-red-50/70 dark:bg-red-950/10";
              } else if (rowStyle === "today") {
                rowCls = "bg-orange-50/40 hover:bg-orange-50/70 dark:bg-orange-950/10";
              }

              return (
                <TableRow key={lead.id} className={rowCls}>
                  <TableCell>
                    <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                      {lead.full_name}
                    </Link>
                    <p className="text-xs text-muted-foreground font-mono">{lead.lead_number}</p>
                  </TableCell>
                  <TableCell className="text-sm font-mono">{lead.phone}</TableCell>
                  <TableCell>
                    <LeadStatusBadge status={lead.status} />
                  </TableCell>
                  <TableCell>
                    <TemperatureBadge temperature={lead.temperature} />
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{formatDate(lead.next_followup_date)}</p>
                    <p className={`text-xs mt-0.5 ${relative.cls}`}>{relative.label}</p>
                  </TableCell>
                  <TableCell>
                    {lead.followup_type ? (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <FuTypeIcon type={lead.followup_type} />
                        {lead.followup_type}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{lead.assigned_to.name}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
