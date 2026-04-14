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
  Trash2,
  Loader2,
  Calendar,
  User,
} from "lucide-react";
import { toast } from "sonner";

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
  isAdmin: boolean;
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
  return { label: `in ${diff}d`, cls: "text-muted-foreground" };
}

// ── Follow-up type icon ──────────────────────────────────────────
function FuTypeIcon({ type }: { type: string | null }) {
  switch (type) {
    case "Call":      return <Phone className="h-3.5 w-3.5 text-green-600 shrink-0" />;
    case "Email":     return <Mail className="h-3.5 w-3.5 text-blue-600 shrink-0" />;
    case "WhatsApp":  return <MessageCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />;
    case "Visit":     return <Home className="h-3.5 w-3.5 text-orange-500 shrink-0" />;
    case "Meeting":   return <Users className="h-3.5 w-3.5 text-purple-600 shrink-0" />;
    case "Activity":  return <Zap className="h-3.5 w-3.5 text-yellow-500 shrink-0" />;
    default:          return null;
  }
}

// ── Main component ───────────────────────────────────────────────
export function FollowUpsClient({
  leads: initialLeads,
  users,
  isManagerOrAdmin,
  isAdmin,
  currentUserId,
}: FollowUpsClientProps) {
  const [leads, setLeads] = useState<FollowUpLead[]>(initialLeads);
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [clearingId, setClearingId] = useState<string | null>(null);

  async function handleClearFollowUp(leadId: string) {
    setClearingId(leadId);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next_followup_date: null, followup_type: null }),
      });
      if (!res.ok) { toast.error("Failed to clear follow-up"); return; }
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      toast.success("Follow-up cleared");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setClearingId(null);
    }
  }

  const today = useMemo(() => startOfDay(new Date()), []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return leads.filter((l) => {
      if (assigneeFilter !== "all" && l.assigned_to.id !== assigneeFilter) return false;
      if (q && !l.full_name.toLowerCase().includes(q) && !l.phone.includes(q)) return false;
      return true;
    });
  }, [leads, search, assigneeFilter]);

  const buckets = useMemo(() => {
    const overdue: FollowUpLead[] = [];
    const todayLeads: FollowUpLead[] = [];
    const next3: FollowUpLead[] = [];
    const next7: FollowUpLead[] = [];
    const next30: FollowUpLead[] = [];
    const hot: FollowUpLead[] = [];
    const noDate: FollowUpLead[] = [];

    const todayEnd = endOfDay(today);
    const end3 = endOfDay(addDays(today, 3));
    const end7 = endOfDay(addDays(today, 7));
    const end30 = endOfDay(addDays(today, 30));

    for (const lead of filtered) {
      if (lead.temperature === "Hot") hot.push(lead);
      if (!lead.next_followup_date) { noDate.push(lead); continue; }
      const d = new Date(lead.next_followup_date);
      if (d < today) {
        overdue.push(lead);
      } else {
        if (d <= todayEnd) todayLeads.push(lead);
        if (d <= end3) next3.push(lead);
        if (d <= end7) next7.push(lead);
        if (d <= end30) next30.push(lead);
      }
    }

    return { overdue, today: todayLeads, next3, next7, next30, all: filtered, hot, noDate };
  }, [filtered, today]);

  const sharedProps = { isAdmin, onClearFollowUp: handleClearFollowUp, clearingId };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Follow-ups</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {buckets.overdue.length > 0 && (
            <span className="text-destructive font-medium">{buckets.overdue.length} overdue · </span>
          )}
          {buckets.today.length} today · {buckets.next7.length} next 7d · {filtered.length} total
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm w-full"
          />
        </div>
        {isManagerOrAdmin && (
          <Select value={assigneeFilter} onValueChange={(v) => v && setAssigneeFilter(v)}>
            <SelectTrigger className="h-9 sm:w-44 text-sm">
              <SelectValue>
                {assigneeFilter === "all"
                  ? "All assignees"
                  : assigneeFilter === currentUserId
                  ? "My leads"
                  : users.find((u) => u.id === assigneeFilter)?.name ?? "All assignees"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              <SelectItem value={currentUserId}>My leads</SelectItem>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overdue">
        <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
          <TabsTrigger value="overdue" className="gap-1 text-xs sm:text-sm">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>Overdue</span>
            {buckets.overdue.length > 0 && (
              <span className="ml-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 leading-5">
                {buckets.overdue.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="today" className="gap-1 text-xs sm:text-sm">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>Today</span>
            <span className="text-[10px] opacity-70">({buckets.today.length})</span>
          </TabsTrigger>
          <TabsTrigger value="next3" className="text-xs sm:text-sm">
            <span className="hidden sm:inline">Next 3 Days</span>
            <span className="sm:hidden">3d</span>
            <span className="text-[10px] opacity-70 ml-0.5">({buckets.next3.length})</span>
          </TabsTrigger>
          <TabsTrigger value="next7" className="text-xs sm:text-sm">
            <span className="hidden sm:inline">Next 7 Days</span>
            <span className="sm:hidden">7d</span>
            <span className="text-[10px] opacity-70 ml-0.5">({buckets.next7.length})</span>
          </TabsTrigger>
          <TabsTrigger value="next30" className="text-xs sm:text-sm">
            <span className="hidden sm:inline">Next 30 Days</span>
            <span className="sm:hidden">30d</span>
            <span className="text-[10px] opacity-70 ml-0.5">({buckets.next30.length})</span>
          </TabsTrigger>
          <TabsTrigger value="all" className="text-xs sm:text-sm">
            All
            <span className="text-[10px] opacity-70 ml-0.5">({buckets.all.length})</span>
          </TabsTrigger>
          <TabsTrigger value="hot" className="gap-1 text-xs sm:text-sm">
            <Flame className="h-3.5 w-3.5 text-orange-500 shrink-0" />
            <span>Hot</span>
            <span className="text-[10px] opacity-70">({buckets.hot.length})</span>
          </TabsTrigger>
          <TabsTrigger value="nodate" className="gap-1 text-xs sm:text-sm">
            <CalendarX className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">No Date Set</span>
            <span className="sm:hidden">No date</span>
            <span className="text-[10px] opacity-70 ml-0.5">({buckets.noDate.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overdue">
          <LeadList leads={buckets.overdue} emptyText="No overdue follow-ups" urgency="overdue" {...sharedProps} />
        </TabsContent>
        <TabsContent value="today">
          <LeadList leads={buckets.today} emptyText="No follow-ups due today" urgency="today" {...sharedProps} />
        </TabsContent>
        <TabsContent value="next3">
          <LeadList leads={buckets.next3} emptyText="No follow-ups in the next 3 days" {...sharedProps} />
        </TabsContent>
        <TabsContent value="next7">
          <LeadList leads={buckets.next7} emptyText="No follow-ups in the next 7 days" {...sharedProps} />
        </TabsContent>
        <TabsContent value="next30">
          <LeadList leads={buckets.next30} emptyText="No follow-ups in the next 30 days" {...sharedProps} />
        </TabsContent>
        <TabsContent value="all">
          <LeadList leads={buckets.all} emptyText="No active leads" {...sharedProps} />
        </TabsContent>
        <TabsContent value="hot">
          <LeadList leads={buckets.hot} emptyText="No hot leads" {...sharedProps} />
        </TabsContent>
        <TabsContent value="nodate">
          <div className="mt-2 mb-1 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
            These leads have no follow-up date scheduled. Set a follow-up to keep them from falling through the cracks.
          </div>
          <LeadList leads={buckets.noDate} emptyText="All active leads have a follow-up date set" {...sharedProps} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Shared list: cards on mobile, table on sm+ ───────────────────
function LeadList({
  leads,
  emptyText,
  urgency,
  isAdmin,
  onClearFollowUp,
  clearingId,
}: {
  leads: FollowUpLead[];
  emptyText: string;
  urgency?: "overdue" | "today";
  isAdmin: boolean;
  onClearFollowUp: (id: string) => void;
  clearingId: string | null;
}) {
  if (leads.length === 0) {
    return (
      <div className="mt-2 rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <>
      {/* ── Mobile card list ── */}
      <div className="sm:hidden mt-2 space-y-2">
        {leads.map((lead) => {
          const relative = getRelative(lead.next_followup_date);
          let cardCls = "rounded-lg border bg-card p-3 space-y-2";
          if (urgency === "overdue" || (!lead.next_followup_date ? false : new Date(lead.next_followup_date) < startOfDay(new Date()))) {
            cardCls = "rounded-lg border bg-red-50/60 border-red-200 dark:bg-red-950/10 p-3 space-y-2";
          } else if (urgency === "today") {
            cardCls = "rounded-lg border bg-orange-50/60 border-orange-200 dark:bg-orange-950/10 p-3 space-y-2";
          }

          return (
            <div key={lead.id} className={cardCls}>
              {/* Row 1: name + badges + trash */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/leads/${lead.id}`} className="font-medium text-sm hover:underline leading-tight">
                    {lead.full_name}
                  </Link>
                  <p className="text-[11px] text-muted-foreground font-mono">{lead.lead_number}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <LeadStatusBadge status={lead.status} />
                  <TemperatureBadge temperature={lead.temperature} />
                  {isAdmin && (
                    <button
                      onClick={() => onClearFollowUp(lead.id)}
                      disabled={clearingId === lead.id}
                      className="ml-1 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      title="Clear follow-up"
                    >
                      {clearingId === lead.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: phone + assignee */}
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <a href={`tel:${lead.phone}`} className="flex items-center gap-1 font-mono">
                  <Phone className="h-3 w-3" />{lead.phone}
                </a>
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />{lead.assigned_to.name}
                </span>
              </div>

              {/* Row 3: follow-up date + type */}
              <div className="flex items-center gap-2 text-xs">
                <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{formatDate(lead.next_followup_date)}</span>
                <span className={relative.cls}>{relative.label}</span>
                {lead.followup_type && (
                  <span className="flex items-center gap-1 text-muted-foreground ml-auto">
                    <FuTypeIcon type={lead.followup_type} />
                    {lead.followup_type}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Desktop table ── */}
      <div className="hidden sm:block mt-2 rounded-lg border bg-card overflow-hidden">
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
              {isAdmin && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => {
              const relative = getRelative(lead.next_followup_date);
              let rowCls = "hover:bg-muted/30";
              if (urgency === "overdue" || (!lead.next_followup_date ? false : new Date(lead.next_followup_date) < startOfDay(new Date()))) {
                rowCls = "bg-red-50/40 hover:bg-red-50/70 dark:bg-red-950/10";
              } else if (urgency === "today") {
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
                  <TableCell><LeadStatusBadge status={lead.status} /></TableCell>
                  <TableCell><TemperatureBadge temperature={lead.temperature} /></TableCell>
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
                  {isAdmin && (
                    <TableCell>
                      <button
                        onClick={() => onClearFollowUp(lead.id)}
                        disabled={clearingId === lead.id}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        title="Clear follow-up"
                      >
                        {clearingId === lead.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
