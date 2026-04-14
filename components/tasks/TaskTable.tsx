"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
import { TaskStatusBadge, PriorityBadge } from "@/components/shared/LeadStatusBadge";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { AlertTriangle, Clock, Search } from "lucide-react";
import { startOfDay, endOfDay, addDays } from "date-fns";

type Task = {
  id: string;
  task_number: string;
  title: string;
  status: string;
  priority: string;
  due_date: Date;
  revenue_tagged: boolean;
  revenue_amount: { toString(): string } | null;
  assigned_to: { id: string; name: string };
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
}

const ACTIVE_STATUSES = ["Todo", "InProgress"];

export function TaskTable({ tasks, users, clients }: TaskTableProps) {
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (assigneeFilter !== "all" && t.assigned_to.id !== assigneeFilter) return false;
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
  }, [tasks, search, assigneeFilter, clientFilter]);

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

  return (
    <div className="space-y-4">
      {/* Header filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search title or number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 w-full text-sm"
          />
        </div>
        {users.length > 0 && (
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
        )}
        {clients.length > 0 && (
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
        )}
      </div>

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
            <TaskGrid tasks={buckets[key]} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function TaskGrid({ tasks }: { tasks: Task[] }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>Task</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead>Assigned To</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Linked To</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                No tasks in this category
              </TableCell>
            </TableRow>
          ) : (
            tasks.map((task) => {
              const isOverdue =
                new Date(task.due_date) < new Date() &&
                !["Done", "Cancelled"].includes(task.status);
              return (
                <TableRow key={task.id} className="hover:bg-muted/30">
                  <TableCell>
                    <Link href={`/tasks/${task.id}`} className="font-medium hover:underline">
                      {task.title}
                    </Link>
                    <p className="text-xs text-muted-foreground font-mono">{task.task_number}</p>
                  </TableCell>
                  <TableCell>
                    <TaskStatusBadge status={task.status} />
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={task.priority} />
                  </TableCell>
                  <TableCell className={cn("text-sm", isOverdue && "text-destructive font-medium")}>
                    {formatDate(task.due_date)}
                  </TableCell>
                  <TableCell className="text-sm">{task.assigned_to.name}</TableCell>
                  <TableCell className="text-sm">
                    {task.client ? (
                      <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-1.5 py-0.5 rounded">
                        {task.client.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {task.lead ? (
                      <Link href={`/leads/${task.lead.id}`} className="text-primary hover:underline text-xs">
                        {task.lead.lead_number}
                      </Link>
                    ) : task.opportunity ? (
                      <Link href={`/opportunities/${task.opportunity.id}`} className="text-primary hover:underline text-xs">
                        {task.opportunity.opp_number}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground text-xs">Standalone</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
