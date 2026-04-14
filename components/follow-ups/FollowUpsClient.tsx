"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PriorityBadge } from "@/components/shared/LeadStatusBadge";
import { formatDate, formatDateTime } from "@/lib/utils";
import { startOfDay, endOfDay, addDays, differenceInCalendarDays } from "date-fns";
import {
  Phone, Mail, MessageCircle, Home, Users, Zap, Flame,
  AlertTriangle, Clock, Search, Trash2, Loader2, Check, Plus,
  Building2, User, Calendar, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

const FOLLOW_UP_TYPES = ["Call", "Email", "WhatsApp", "Visit", "Meeting", "Activity", "Internal"] as const;

export type FollowUp = {
  id: string;
  type: string;
  priority: string;
  scheduled_at: Date;
  completed_at: Date | null;
  notes: string | null;
  outcome: string | null;
  lead: { id: string; lead_number: string; full_name: string; status: string; temperature: string } | null;
  opportunity: { id: string; opp_number: string; name: string } | null;
  assigned_to: { id: string; name: string } | null;
  created_by: { id: string; name: string };
};

interface FollowUpsClientProps {
  followUps: FollowUp[];
  users: { id: string; name: string }[];
  isManagerOrAdmin: boolean;
  isAdmin: boolean;
  currentUserId: string;
}

// ── Relative date display ────────────────────────────────────────
function getRelative(date: Date): { label: string; cls: string } {
  const today = startOfDay(new Date());
  const diff = differenceInCalendarDays(startOfDay(new Date(date)), today);
  if (diff < -1) return { label: `${Math.abs(diff)}d overdue`, cls: "text-destructive font-medium" };
  if (diff === -1) return { label: "Yesterday", cls: "text-destructive font-medium" };
  if (diff === 0) return { label: "Today", cls: "text-orange-600 font-medium" };
  if (diff === 1) return { label: "Tomorrow", cls: "text-yellow-600 font-medium" };
  return { label: `in ${diff}d`, cls: "text-muted-foreground" };
}

// ── Follow-up type icon ──────────────────────────────────────────
function FuTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "Call":     return <Phone className="h-3.5 w-3.5 text-green-600 shrink-0" />;
    case "Email":    return <Mail className="h-3.5 w-3.5 text-blue-600 shrink-0" />;
    case "WhatsApp": return <MessageCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />;
    case "Visit":    return <Home className="h-3.5 w-3.5 text-orange-500 shrink-0" />;
    case "Meeting":  return <Users className="h-3.5 w-3.5 text-purple-600 shrink-0" />;
    case "Activity": return <Zap className="h-3.5 w-3.5 text-yellow-500 shrink-0" />;
    case "Internal": return <Flame className="h-3.5 w-3.5 text-red-400 shrink-0" />;
    default:         return null;
  }
}

// ── Entity link ──────────────────────────────────────────────────
function EntityLabel({ fu }: { fu: FollowUp }) {
  if (fu.lead) {
    return (
      <Link href={`/leads/${fu.lead.id}`} className="font-medium text-sm hover:underline leading-tight line-clamp-1">
        {fu.lead.full_name}
        <span className="text-[11px] text-muted-foreground font-mono ml-1">{fu.lead.lead_number}</span>
      </Link>
    );
  }
  if (fu.opportunity) {
    return (
      <Link href={`/opportunities/${fu.opportunity.id}`} className="font-medium text-sm hover:underline leading-tight line-clamp-1">
        <span className="flex items-center gap-1">
          <Building2 className="h-3 w-3 shrink-0 text-indigo-500" />
          {fu.opportunity.name}
          <span className="text-[11px] text-muted-foreground font-mono">{fu.opportunity.opp_number}</span>
        </span>
      </Link>
    );
  }
  return <span className="text-sm text-muted-foreground">Standalone</span>;
}

// ── Add Next Dialog ──────────────────────────────────────────────
function AddNextDialog({
  fu,
  users,
  currentUserId,
  onCreated,
  onClose,
}: {
  fu: FollowUp;
  users: { id: string; name: string }[];
  currentUserId: string;
  onCreated: (next: FollowUp) => void;
  onClose: () => void;
}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().slice(0, 16);

  const [type, setType] = useState(fu.type);
  const [priority, setPriority] = useState(fu.priority);
  const [scheduledAt, setScheduledAt] = useState(defaultDate);
  const [notes, setNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState(fu.assigned_to?.id ?? currentUserId);
  const [loading, setLoading] = useState(false);

  const assigneeName = users.find((u) => u.id === assignedTo)?.name ?? "Select assignee";

  async function handleSubmit() {
    if (!scheduledAt) { toast.error("Date is required"); return; }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        type, priority, scheduled_at: scheduledAt,
        assigned_to_id: assignedTo || undefined,
        notes: notes || undefined,
      };
      if (fu.lead_id) body.lead_id = fu.lead_id;
      if (fu.opportunity_id) body.opportunity_id = fu.opportunity_id;

      const res = await fetch("/api/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error ?? "Failed"); return; }
      toast.success("Next follow-up scheduled");
      onCreated(result.data);
      onClose();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 pt-1">
      <p className="text-sm text-muted-foreground">
        Schedule next follow-up for{" "}
        <span className="font-medium text-foreground">
          {fu.lead?.full_name ?? fu.opportunity?.name ?? "this record"}
        </span>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={(v) => v && setType(v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue>{type}</SelectValue></SelectTrigger>
            <SelectContent>
              {FOLLOW_UP_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Priority</Label>
          <Select value={priority} onValueChange={(v) => v && setPriority(v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue>{priority}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Date &amp; Time *</Label>
        <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="h-8 text-xs" />
      </div>
      {users.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Assign To</Label>
          <Select value={assignedTo} onValueChange={(v) => v && setAssignedTo(v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue>{assigneeName}</SelectValue></SelectTrigger>
            <SelectContent>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs">Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" className="text-xs resize-none h-16" />
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onClose} className="flex-1">Cancel</Button>
        <Button size="sm" onClick={handleSubmit} disabled={loading} className="flex-1">
          {loading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          Schedule
        </Button>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────
export function FollowUpsClient({
  followUps: initialFollowUps,
  users,
  isManagerOrAdmin,
  isAdmin,
  currentUserId,
}: FollowUpsClientProps) {
  const [followUps, setFollowUps] = useState<FollowUp[]>(initialFollowUps);
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addNextFor, setAddNextFor] = useState<FollowUp | null>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const todayEnd = useMemo(() => endOfDay(new Date()), []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return followUps.filter((fu) => {
      if (assigneeFilter !== "all" && fu.assigned_to?.id !== assigneeFilter) return false;
      if (q) {
        const haystack = [
          fu.lead?.full_name ?? "",
          fu.lead?.lead_number ?? "",
          fu.opportunity?.name ?? "",
          fu.opportunity?.opp_number ?? "",
          fu.notes ?? "",
          fu.type,
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [followUps, search, assigneeFilter]);

  const buckets = useMemo(() => {
    const pending = filtered.filter((fu) => !fu.completed_at);
    const completed = filtered.filter((fu) => !!fu.completed_at);

    const overdue = pending.filter((fu) => new Date(fu.scheduled_at) < today);
    const todayItems = pending.filter((fu) => {
      const d = new Date(fu.scheduled_at);
      return d >= today && d <= todayEnd;
    });
    const next3 = pending.filter((fu) => {
      const d = new Date(fu.scheduled_at);
      return d > todayEnd && d <= endOfDay(addDays(today, 3));
    });
    const next7 = pending.filter((fu) => {
      const d = new Date(fu.scheduled_at);
      return d > todayEnd && d <= endOfDay(addDays(today, 7));
    });
    return { overdue, today: todayItems, next3, next7, pending, completed };
  }, [filtered, today, todayEnd]);

  async function handleMarkComplete(fu: FollowUp, andAddNext = false) {
    setCompletingId(fu.id);
    try {
      const res = await fetch(`/api/follow-ups/${fu.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed_at: new Date().toISOString() }),
      });
      if (!res.ok) { toast.error("Failed to mark complete"); return; }
      setFollowUps((prev) =>
        prev.map((f) => f.id === fu.id ? { ...f, completed_at: new Date() } : f)
      );
      toast.success("Marked complete");
      if (andAddNext) setAddNextFor(fu);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setCompletingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/follow-ups/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Failed to delete"); return; }
      setFollowUps((prev) => prev.filter((f) => f.id !== id));
      toast.success("Deleted");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setDeletingId(null);
    }
  }

  function handleNextCreated(next: FollowUp) {
    setFollowUps((prev) => [...prev, next].sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    ));
  }

  const sharedProps = {
    isAdmin,
    completingId,
    deletingId,
    onMarkComplete: handleMarkComplete,
    onDelete: handleDelete,
    onAddNext: (fu: FollowUp) => setAddNextFor(fu),
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Follow-ups</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {buckets.overdue.length > 0 && (
            <span className="text-destructive font-medium">{buckets.overdue.length} overdue · </span>
          )}
          {buckets.today.length} today · {buckets.next7.length} next 7d · {buckets.pending.length} total pending
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search lead, opp, type, notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm w-full"
          />
        </div>
        {isManagerOrAdmin && users.length > 0 && (
          <Select value={assigneeFilter} onValueChange={(v) => v && setAssigneeFilter(v)}>
            <SelectTrigger className="h-9 sm:w-44 text-sm">
              <SelectValue>
                {assigneeFilter === "all"
                  ? "All assignees"
                  : users.find((u) => u.id === assigneeFilter)?.name ?? "All assignees"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              <SelectItem value={currentUserId}>Mine</SelectItem>
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
          <TabsTrigger value="pending" className="text-xs sm:text-sm">
            <span className="hidden sm:inline">All Pending</span>
            <span className="sm:hidden">All</span>
            <span className="text-[10px] opacity-70 ml-0.5">({buckets.pending.length})</span>
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-1 text-xs sm:text-sm">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>Done</span>
            <span className="text-[10px] opacity-70 ml-0.5">({buckets.completed.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overdue">
          <FollowUpList items={buckets.overdue} emptyText="No overdue follow-ups" urgency="overdue" {...sharedProps} />
        </TabsContent>
        <TabsContent value="today">
          <FollowUpList items={buckets.today} emptyText="No follow-ups due today" urgency="today" {...sharedProps} />
        </TabsContent>
        <TabsContent value="next3">
          <FollowUpList items={buckets.next3} emptyText="No follow-ups in the next 3 days" {...sharedProps} />
        </TabsContent>
        <TabsContent value="next7">
          <FollowUpList items={buckets.next7} emptyText="No follow-ups in the next 7 days" {...sharedProps} />
        </TabsContent>
        <TabsContent value="pending">
          <FollowUpList items={buckets.pending} emptyText="No pending follow-ups" {...sharedProps} />
        </TabsContent>
        <TabsContent value="completed">
          <FollowUpList items={buckets.completed} emptyText="No completed follow-ups" isCompleted {...sharedProps} />
        </TabsContent>
      </Tabs>

      {/* Add Next Follow-up Dialog */}
      <Dialog open={!!addNextFor} onOpenChange={(o) => { if (!o) setAddNextFor(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Next Follow-up</DialogTitle>
          </DialogHeader>
          {addNextFor && (
            <AddNextDialog
              fu={addNextFor}
              users={users}
              currentUserId={currentUserId}
              onCreated={handleNextCreated}
              onClose={() => setAddNextFor(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── List: cards on mobile, table on sm+ ─────────────────────────
function FollowUpList({
  items,
  emptyText,
  urgency,
  isCompleted,
  isAdmin,
  completingId,
  deletingId,
  onMarkComplete,
  onDelete,
  onAddNext,
}: {
  items: FollowUp[];
  emptyText: string;
  urgency?: "overdue" | "today";
  isCompleted?: boolean;
  isAdmin: boolean;
  completingId: string | null;
  deletingId: string | null;
  onMarkComplete: (fu: FollowUp, andAddNext?: boolean) => void;
  onDelete: (id: string) => void;
  onAddNext: (fu: FollowUp) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="mt-2 rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <>
      {/* ── Mobile cards ── */}
      <div className="sm:hidden mt-2 space-y-2">
        {items.map((fu) => {
          const scheduled = new Date(fu.scheduled_at);
          const relative = !isCompleted ? getRelative(scheduled) : null;
          const isOverdue = !isCompleted && scheduled < startOfDay(new Date());
          let cardCls = "rounded-lg border bg-card p-3 space-y-2";
          if (isOverdue || urgency === "overdue") {
            cardCls = "rounded-lg border bg-red-50/60 border-red-200 dark:bg-red-950/10 p-3 space-y-2";
          } else if (urgency === "today") {
            cardCls = "rounded-lg border bg-orange-50/40 border-orange-200 dark:bg-orange-950/10 p-3 space-y-2";
          }

          return (
            <div key={fu.id} className={cardCls}>
              {/* Row 1: entity + priority */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <EntityLabel fu={fu} />
                </div>
                <div className="shrink-0">
                  <PriorityBadge priority={fu.priority} />
                </div>
              </div>

              {/* Row 2: type + date */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <FuTypeIcon type={fu.type} />
                  {fu.type}
                </span>
                <span className="text-muted-foreground/40">·</span>
                <Calendar className="h-3 w-3 shrink-0" />
                <span>{isCompleted ? formatDateTime(fu.completed_at!) : formatDate(scheduled)}</span>
                {relative && <span className={relative.cls}>{relative.label}</span>}
              </div>

              {/* Row 3: assignee + notes */}
              <div className="flex items-start justify-between gap-2 text-xs text-muted-foreground">
                {fu.assigned_to && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {fu.assigned_to.name}
                  </span>
                )}
                {fu.notes && (
                  <p className="text-xs text-muted-foreground line-clamp-1 flex-1 text-right">{fu.notes}</p>
                )}
              </div>

              {/* Row 4: actions */}
              {!isCompleted && (
                <div className="flex gap-1.5 pt-1 border-t">
                  <button
                    onClick={() => onMarkComplete(fu)}
                    disabled={completingId === fu.id}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors disabled:opacity-50"
                  >
                    {completingId === fu.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Done
                  </button>
                  <button
                    onClick={() => onMarkComplete(fu, true)}
                    disabled={completingId === fu.id}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" />
                    Done + Next
                  </button>
                  {!isCompleted && (
                    <button
                      onClick={() => onAddNext(fu)}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-muted text-muted-foreground hover:bg-muted/80 border transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      Add Next
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => onDelete(fu.id)}
                      disabled={deletingId === fu.id}
                      className="ml-auto p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                    >
                      {deletingId === fu.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              )}
              {isCompleted && isAdmin && (
                <div className="flex gap-1.5 pt-1 border-t">
                  <button
                    onClick={() => onDelete(fu.id)}
                    disabled={deletingId === fu.id}
                    className="ml-auto p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  >
                    {deletingId === fu.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Desktop table ── */}
      <div className="hidden sm:block mt-2 rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Entity</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>{isCompleted ? "Completed" : "Scheduled"}</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((fu) => {
              const scheduled = new Date(fu.scheduled_at);
              const relative = !isCompleted ? getRelative(scheduled) : null;
              const isOverdue = !isCompleted && scheduled < startOfDay(new Date());
              let rowCls = "hover:bg-muted/30";
              if (isOverdue || urgency === "overdue") rowCls = "bg-red-50/40 hover:bg-red-50/70 dark:bg-red-950/10";
              else if (urgency === "today") rowCls = "bg-orange-50/40 hover:bg-orange-50/70 dark:bg-orange-950/10";

              return (
                <TableRow key={fu.id} className={rowCls}>
                  <TableCell>
                    <EntityLabel fu={fu} />
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-sm">
                      <FuTypeIcon type={fu.type} />
                      {fu.type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={fu.priority} />
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{isCompleted ? formatDateTime(fu.completed_at!) : formatDate(scheduled)}</p>
                    {relative && <p className={`text-xs mt-0.5 ${relative.cls}`}>{relative.label}</p>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {fu.assigned_to ? (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3 text-muted-foreground" />
                        {fu.assigned_to.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {fu.notes ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      {!isCompleted && (
                        <>
                          <button
                            onClick={() => onMarkComplete(fu)}
                            disabled={completingId === fu.id}
                            title="Mark complete"
                            className="p-1 rounded text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                          >
                            {completingId === fu.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => onMarkComplete(fu, true)}
                            disabled={completingId === fu.id}
                            title="Mark complete and schedule next"
                            className="p-1 rounded text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50 text-xs font-medium"
                          >
                            <span className="flex items-center gap-0.5">
                              <Check className="h-3.5 w-3.5" />
                              <Plus className="h-3 w-3" />
                            </span>
                          </button>
                          <button
                            onClick={() => onAddNext(fu)}
                            title="Add next follow-up"
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => onDelete(fu.id)}
                          disabled={deletingId === fu.id}
                          title="Delete"
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        >
                          {deletingId === fu.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
