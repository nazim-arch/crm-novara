"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TaskStatusBadge, PriorityBadge } from "@/components/shared/LeadStatusBadge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { AlertTriangle, Clock, Search, ArrowUpDown, ArrowUp, ArrowDown, Timer, CheckSquare, CheckCircle2, Trash2, X, ListChecks } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ColumnPicker } from "@/components/shared/ColumnPicker";
import { TASK_COLUMNS } from "@/lib/task-columns";
import { checklistProgress } from "@/lib/checklist";
import type { ReactNode } from "react";
import { ColumnFilterHeader } from "@/components/shared/ColumnFilterHeader";
import { startOfDay, endOfDay, addDays, differenceInCalendarDays } from "date-fns";

type Task = {
  id: string;
  task_number: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  due_date: Date;
  start_date: Date | null;
  completion_date: Date | null;
  created_at: Date;
  updated_at?: Date;
  sector?: string | null;
  recurrence?: string;
  checklist?: unknown;
  revenue_tagged: boolean;
  revenue_amount: { toString(): string } | null;
  assigned_to: { id: string; name: string };
  created_by?: { id: string; name: string } | null;
  lead: { id: string; lead_number: string; full_name: string } | null;
  opportunity: { id: string; opp_number: string; name: string } | null;
  client: { id: string; name: string } | null;
};

type User = { id: string; name: string };
type Client = { id: string; name: string };

interface TaskTableProps {
  tasks: Task[];
  users: User[];
  clients: Client[];
  currentParams: { status?: string; assigned_to?: string };
  /** Visible column ids (per-user preference); defaults to all columns */
  initialColumns?: string[];
  /** Whether the current user can edit tasks (enables selection + inline actions) */
  canUpdate?: boolean;
  /** Whether the current user can delete tasks (enables bulk delete) */
  canDelete?: boolean;
}

const ACTIVE_STATUSES = ["Todo", "InProgress"];

const PRIORITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function getDaysElapsed(task: Task): { days: number; done: boolean } | null {
  if (task.status === "Cancelled") return null;
  const start = task.start_date ?? task.created_at;
  if (task.status === "Done" && task.completion_date) {
    return { days: differenceInCalendarDays(new Date(task.completion_date), new Date(start)), done: true };
  }
  return { days: differenceInCalendarDays(new Date(), new Date(start)), done: false };
}

function DaysElapsedBadge({ task }: { task: Task }) {
  const result = getDaysElapsed(task);
  if (!result) return <span className="text-muted-foreground text-xs">—</span>;
  const { days, done } = result;
  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <Timer className="h-3 w-3 shrink-0" />
        {days}d
      </span>
    );
  }
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
      days > 14 ? "text-destructive" : days > 7 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"
    )}>
      <Timer className="h-3 w-3 shrink-0" />
      {days}d
    </span>
  );
}

function ChecklistProgress({ task }: { task: Task }) {
  const p = checklistProgress(task.checklist);
  if (!p) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = Math.round((p.done / p.total) * 100);
  const complete = p.done === p.total;
  return (
    <span className="inline-flex items-center gap-1.5" title={`${p.done} of ${p.total} done`}>
      <ListChecks className={cn("h-3.5 w-3.5 shrink-0", complete ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")} />
      <span className="inline-block h-1 w-8 rounded-full bg-muted overflow-hidden align-middle">
        <span className={cn("block h-full", complete ? "bg-emerald-500" : "bg-primary")} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">{p.done}/{p.total}</span>
    </span>
  );
}

const PRIORITY_OPTIONS = [
  { label: "Critical", value: "Critical" },
  { label: "High", value: "High" },
  { label: "Medium", value: "Medium" },
  { label: "Low", value: "Low" },
];

export function TaskTable({ tasks, users, clients, initialColumns, canUpdate = false, canDelete = false }: TaskTableProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [sortCol, setSortCol] = useState("due_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    () => new Set(initialColumns ?? TASK_COLUMNS.filter((c) => !c.defaultHidden).map((c) => c.id))
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleMany = (ids: string[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) { if (checked) next.add(id); else next.delete(id); }
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  async function runBulk(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/tasks/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error ?? "Bulk action failed");
        return;
      }
      toast.success(`Updated ${result.data.count} task${result.data.count === 1 ? "" : "s"}`);
      clearSelection();
      startTransition(() => router.refresh());
    } catch {
      toast.error("Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function completeOne(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Done" }),
      });
      if (!res.ok) {
        const r = await res.json().catch(() => ({}));
        toast.error(r.error ?? "Failed to complete task");
        return;
      }
      toast.success("Task completed");
      startTransition(() => router.refresh());
    } catch {
      toast.error("Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const { today, todayStart, todayEnd } = useMemo(() => {
    const t = new Date();
    return { today: t, todayStart: startOfDay(t), todayEnd: endOfDay(t) };
  }, []);

  const filtered = useMemo(() => {
    const list = tasks.filter((t) => {
      if (assigneeFilter !== "all" && t.assigned_to.id !== assigneeFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (clientFilter !== "all") {
        if (clientFilter === "none") { if (t.client !== null) return false; }
        else if (t.client?.id !== clientFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !t.task_number.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortCol === "due_date") cmp = new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      else if (sortCol === "title") cmp = a.title.localeCompare(b.title);
      else if (sortCol === "priority") cmp = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
      else if (sortCol === "status") cmp = a.status.localeCompare(b.status);
      else if (sortCol === "assigned_to") cmp = a.assigned_to.name.localeCompare(b.assigned_to.name);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [tasks, search, assigneeFilter, priorityFilter, clientFilter, sortCol, sortDir]);

  const buckets = useMemo(() => {
    const overdue = filtered.filter(
      (t) => ACTIVE_STATUSES.includes(t.status) && new Date(t.due_date) < todayStart
    );
    const todayTasks = filtered.filter(
      (t) => ACTIVE_STATUSES.includes(t.status) && new Date(t.due_date) >= todayStart && new Date(t.due_date) <= todayEnd
    );
    const next3 = filtered.filter(
      (t) => ACTIVE_STATUSES.includes(t.status) && new Date(t.due_date) > todayEnd && new Date(t.due_date) <= endOfDay(addDays(today, 3))
    );
    const next7 = filtered.filter(
      (t) => ACTIVE_STATUSES.includes(t.status) && new Date(t.due_date) > todayEnd && new Date(t.due_date) <= endOfDay(addDays(today, 7))
    );
    const allActive = filtered.filter((t) => ACTIVE_STATUSES.includes(t.status));
    const done = filtered.filter((t) => t.status === "Done");
    return { overdue, today: todayTasks, next3, next7, allActive, done };
  }, [filtered, todayStart, todayEnd, today]);

  const selectable = canUpdate || canDelete;

  return (
    <div className="space-y-4">
      {/* Header filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex flex-col gap-1 flex-1">
          <span className="text-[11px] font-medium text-muted-foreground">Search</span>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search title or number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 w-full text-sm"
            />
          </div>
        </div>
        {users.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Assigned To</span>
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
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {clients.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Client</span>
            <Select value={clientFilter} onValueChange={(v) => v && setClientFilter(v)}>
              <SelectTrigger className="h-9 sm:w-40 text-sm">
                <SelectValue>
                  {clientFilter === "all"
                    ? "All clients"
                    : clientFilter === "none"
                    ? "No client"
                    : clients.find((c) => c.id === clientFilter)?.name ?? "All clients"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                <SelectItem value="none">No client</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="hidden md:flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">&nbsp;</span>
          <ColumnPicker
            listKey="tasks"
            columns={TASK_COLUMNS}
            visible={[...visibleCols]}
            onVisibleChange={(ids) => setVisibleCols(new Set(ids))}
            className="h-9"
          />
        </div>
      </div>

      {/* Bulk action bar */}
      {selectable && selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          busy={busy}
          users={users}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onClear={clearSelection}
          onStatus={(value) => runBulk({ action: "status", ids: [...selected], value })}
          onAssign={(value) => runBulk({ action: "assign", ids: [...selected], value })}
          onDueDate={(value) => runBulk({ action: "due_date", ids: [...selected], value })}
          onDelete={() => runBulk({ action: "delete", ids: [...selected] })}
        />
      )}

      {/* Bucket tabs */}
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
          <TabsTrigger value="allActive" className="text-xs sm:text-sm">
            <span className="hidden sm:inline">All Active</span>
            <span className="sm:hidden">All</span>
            <span className="text-[10px] opacity-70 ml-0.5">({buckets.allActive.length})</span>
          </TabsTrigger>
          <TabsTrigger value="done" className="text-xs sm:text-sm">
            Done
            <span className="text-[10px] opacity-70 ml-0.5">({buckets.done.length})</span>
          </TabsTrigger>
        </TabsList>

        {(["overdue", "today", "next3", "next7", "allActive", "done"] as const).map((key) => (
          <TabsContent key={key} value={key} className="mt-4">
            <TaskGrid
              tasks={buckets[key]}
              sortCol={sortCol}
              sortDir={sortDir}
              onSort={toggleSort}
              priorityFilter={priorityFilter}
              onPriorityFilter={(v) => setPriorityFilter(v ?? "all")}
              assigneeFilter={assigneeFilter}
              onAssigneeFilter={(v) => setAssigneeFilter(v ?? "all")}
              users={users}
              visible={visibleCols}
              selectable={selectable}
              canUpdate={canUpdate}
              busy={busy}
              selected={selected}
              onToggleOne={toggleOne}
              onToggleMany={toggleMany}
              onComplete={completeOne}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function BulkActionBar({
  count, busy, users, canUpdate, canDelete,
  onClear, onStatus, onAssign, onDueDate, onDelete,
}: {
  count: number;
  busy: boolean;
  users: User[];
  canUpdate: boolean;
  canDelete: boolean;
  onClear: () => void;
  onStatus: (value: string) => void;
  onAssign: (value: string) => void;
  onDueDate: (value: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
      <span className="text-sm font-medium">{count} selected</span>
      <div className="h-4 w-px bg-border mx-1" />
      {canUpdate && (
        <>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus("Done")}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Mark Done
          </Button>
          <Select value="" onValueChange={(v) => v && onStatus(v)}>
            <SelectTrigger className="h-7 w-36 text-xs" disabled={busy}>
              <SelectValue placeholder="Set status…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todo">To Do</SelectItem>
              <SelectItem value="InProgress">In Progress</SelectItem>
              <SelectItem value="Done">Done</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          {users.length > 0 && (
            <Select value="" onValueChange={(v) => v && onAssign(v)}>
              <SelectTrigger className="h-7 w-40 text-xs" disabled={busy}>
                <SelectValue placeholder="Reassign to…" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Due
            <Input
              type="date"
              className="h-7 w-36 text-xs"
              disabled={busy}
              onChange={(e) => e.target.value && onDueDate(e.target.value)}
            />
          </label>
        </>
      )}
      {canDelete && (
        <Button size="sm" variant="destructive" disabled={busy} onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={busy} onClick={onClear} className="ml-auto">
        <X className="h-3.5 w-3.5" /> Clear
      </Button>
    </div>
  );
}

function SortBtn({ col, label, sortCol, sortDir, onSort }: { col: string; label: string; sortCol: string; sortDir: string; onSort: (c: string) => void }) {
  const active = sortCol === col;
  return (
    <button onClick={() => onSort(col)} className="flex items-center gap-1 hover:text-foreground whitespace-nowrap">
      {label}
      {active ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  );
}

function TaskGrid({
  tasks, sortCol, sortDir, onSort,
  priorityFilter, onPriorityFilter,
  assigneeFilter, onAssigneeFilter,
  users, visible,
  selectable, canUpdate, busy, selected, onToggleOne, onToggleMany, onComplete,
}: {
  tasks: Task[];
  sortCol: string;
  sortDir: string;
  onSort: (c: string) => void;
  priorityFilter: string;
  onPriorityFilter: (v: string | null) => void;
  assigneeFilter: string;
  onAssigneeFilter: (v: string | null) => void;
  users: User[];
  visible: Set<string>;
  selectable: boolean;
  canUpdate: boolean;
  busy: boolean;
  selected: Set<string>;
  onToggleOne: (id: string) => void;
  onToggleMany: (ids: string[], checked: boolean) => void;
  onComplete: (id: string) => void;
}) {
  const sh = (col: string, label: string) => <SortBtn col={col} label={label} sortCol={sortCol} sortDir={sortDir} onSort={onSort} />;

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={CheckSquare}
          title="No tasks in this category"
          description="Tasks matching this filter will show up here."
        />
      </div>
    );
  }

  const visibleTaskCols = TASK_COLUMNS.filter((c) => visible.has(c.id));
  const dash = <span className="text-muted-foreground text-xs">—</span>;
  const TASK_CELL_CLASS: Record<string, string> = { days: "text-center", revenue: "text-right" };

  const allIds = tasks.map((t) => t.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = allIds.some((id) => selected.has(id));

  const taskHead = (id: string): ReactNode => {
    switch (id) {
      case "title": return sh("title", "Task");
      case "status": return sh("status", "Status");
      case "priority":
        return <ColumnFilterHeader column="priority" label="Priority" currentSort={sortCol} currentDir={sortDir} filterOptions={PRIORITY_OPTIONS} currentFilter={priorityFilter} onFilter={onPriorityFilter} onSort={onSort} />;
      case "due_date": return sh("due_date", "Due Date");
      case "assigned_to":
        return <ColumnFilterHeader column="assigned_to" label="Assigned To" currentSort={sortCol} currentDir={sortDir} filterOptions={users.map((u) => ({ label: u.name, value: u.id }))} currentFilter={assigneeFilter} onFilter={onAssigneeFilter} onSort={onSort} />;
      default: return TASK_COLUMNS.find((c) => c.id === id)?.label ?? id;
    }
  };

  const taskCell = (id: string, task: Task, isOverdue: boolean): ReactNode => {
    switch (id) {
      case "title":
        return (
          <>
            <Link href={`/tasks/${task.id}`} className="font-medium hover:underline">{task.title}</Link>
            <p className="text-xs text-muted-foreground font-mono">{task.task_number}</p>
          </>
        );
      case "status": return <TaskStatusBadge status={task.status} />;
      case "priority": return <PriorityBadge priority={task.priority} />;
      case "due_date":
        return <span className={cn(isOverdue && "text-destructive font-medium")}>{formatDate(task.due_date)}</span>;
      case "start_date": return task.start_date ? formatDate(task.start_date) : dash;
      case "completion_date": return task.completion_date ? formatDate(task.completion_date) : dash;
      case "assigned_to": return task.assigned_to.name;
      case "created_by": return task.created_by?.name ?? dash;
      case "days": return <DaysElapsedBadge task={task} />;
      case "checklist": return <ChecklistProgress task={task} />;
      case "client":
        return task.client ? (
          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-1.5 py-0.5 rounded">{task.client.name}</span>
        ) : dash;
      case "linked":
        return task.lead ? (
          <Link href={`/leads/${task.lead.id}`} className="text-primary hover:underline text-xs">{task.lead.lead_number}</Link>
        ) : task.opportunity ? (
          <Link href={`/opportunities/${task.opportunity.id}`} className="text-primary hover:underline text-xs">{task.opportunity.opp_number}</Link>
        ) : (
          <span className="text-muted-foreground text-xs">Standalone</span>
        );
      case "sector": return task.sector ?? dash;
      case "recurrence": return task.recurrence && task.recurrence !== "None" ? task.recurrence : dash;
      case "revenue": return task.revenue_tagged && task.revenue_amount ? formatCurrency(Number(task.revenue_amount)) : dash;
      case "description": return task.description ? <span className="line-clamp-1 max-w-[16rem]">{task.description}</span> : dash;
      case "created_at": return formatDate(task.created_at);
      case "updated_at": return task.updated_at ? formatDate(task.updated_at) : dash;
      default: return dash;
    }
  };

  return (
    <>
      {/* Mobile card view */}
      <div className="md:hidden space-y-2">
        {tasks.map((task) => {
          const isOverdue = new Date(task.due_date) < new Date() && !["Done", "Cancelled"].includes(task.status);
          const isActive = ACTIVE_STATUSES.includes(task.status);
          return (
            <div key={task.id} className={cn("rounded-xl border bg-card p-3 space-y-2 shadow-sm", selected.has(task.id) && "ring-2 ring-primary/40")}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  {selectable && (
                    <Checkbox
                      className="mt-1"
                      checked={selected.has(task.id)}
                      onCheckedChange={() => onToggleOne(task.id)}
                      aria-label="Select task"
                    />
                  )}
                  <div className="min-w-0">
                    <Link href={`/tasks/${task.id}`} className="font-semibold text-sm hover:underline block truncate">
                      {task.title}
                    </Link>
                    <span className="text-[11px] text-muted-foreground font-mono">{task.task_number}</span>
                  </div>
                </div>
                <PriorityBadge priority={task.priority} />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <TaskStatusBadge status={task.status} />
                <span className={cn("text-xs", isOverdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                  {formatDate(task.due_date)}
                </span>
                <DaysElapsedBadge task={task} />
                <ChecklistProgress task={task} />
                <span className="text-xs text-muted-foreground">{task.assigned_to.name}</span>
                {canUpdate && isActive && (
                  <Button size="xs" variant="outline" className="ml-auto" disabled={busy} onClick={() => onComplete(task.id)}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Done
                  </Button>
                )}
              </div>
              {(task.lead || task.opportunity || task.client) && (
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {task.client && (
                    <span className="font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-1.5 py-0.5 rounded">
                      {task.client.name}
                    </span>
                  )}
                  {task.lead && (
                    <Link href={`/leads/${task.lead.id}`} className="text-primary hover:underline">
                      {task.lead.lead_number}
                    </Link>
                  )}
                  {task.opportunity && (
                    <Link href={`/opportunities/${task.opportunity.id}`} className="text-primary hover:underline">
                      {task.opportunity.opp_number}
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {selectable && (
                <TableHead className="w-8">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={!allSelected && someSelected}
                    onCheckedChange={(checked) => onToggleMany(allIds, checked === true)}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
              {canUpdate && <TableHead className="w-8" />}
              {visibleTaskCols.map((col) => (
                <TableHead key={col.id} className={TASK_CELL_CLASS[col.id]}>
                  {taskHead(col.id)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => {
              const isOverdue = new Date(task.due_date) < new Date() && !["Done", "Cancelled"].includes(task.status);
              const isActive = ACTIVE_STATUSES.includes(task.status);
              return (
                <TableRow key={task.id} className={cn("hover:bg-muted/30", selected.has(task.id) && "bg-primary/5")}>
                  {selectable && (
                    <TableCell className="w-8">
                      <Checkbox
                        checked={selected.has(task.id)}
                        onCheckedChange={() => onToggleOne(task.id)}
                        aria-label="Select task"
                      />
                    </TableCell>
                  )}
                  {canUpdate && (
                    <TableCell className="w-8">
                      {isActive ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onComplete(task.id)}
                          title="Mark done"
                          className="text-muted-foreground hover:text-emerald-600 transition-colors disabled:opacity-40"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      ) : task.status === "Done" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : null}
                    </TableCell>
                  )}
                  {visibleTaskCols.map((col) => (
                    <TableCell key={col.id} className={cn("text-sm", TASK_CELL_CLASS[col.id])}>
                      {taskCell(col.id, task, isOverdue)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
