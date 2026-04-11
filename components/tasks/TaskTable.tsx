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
};

type User = { id: string; name: string };

interface TaskTableProps {
  tasks: Task[];
  users: User[];
  currentParams: { status?: string; assigned_to?: string };
}

const ACTIVE_STATUSES = ["Todo", "InProgress"];

export function TaskTable({ tasks, users }: TaskTableProps) {
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (assigneeFilter !== "all" && t.assigned_to.id !== assigneeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !t.task_number.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tasks, search, assigneeFilter]);

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
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search title or number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 w-52 text-sm"
          />
        </div>
        {users.length > 0 && (
          <Select value={assigneeFilter} onValueChange={(v) => v && setAssigneeFilter(v)}>
            <SelectTrigger className="h-8 w-44 text-sm">
              <SelectValue placeholder="All assignees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Bucket tabs */}
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
          <TabsTrigger value="next3">Next 3 Days ({buckets.next3.length})</TabsTrigger>
          <TabsTrigger value="next7">Next 7 Days ({buckets.next7.length})</TabsTrigger>
          <TabsTrigger value="allActive">All Active ({buckets.allActive.length})</TabsTrigger>
          <TabsTrigger value="done">Done ({buckets.done.length})</TabsTrigger>
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
            <TableHead>Linked To</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
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
