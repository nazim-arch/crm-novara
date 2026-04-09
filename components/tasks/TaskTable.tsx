"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
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
import { TaskStatusBadge, PriorityBadge } from "@/components/shared/LeadStatusBadge";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useCallback } from "react";

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

export function TaskTable({ tasks, users, currentParams }: TaskTableProps) {
  const router = useRouter();
  const pathname = usePathname();

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(
        Object.entries(currentParams).filter(([, v]) => v) as [string, string][]
      );
      if (value && value !== "all") params.set(key, value);
      else params.delete(key);
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, currentParams]
  );

  const hasFilters = currentParams.status || currentParams.assigned_to;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <Select
          value={currentParams.status ?? "all"}
          onValueChange={(v) => updateParam("status", v ?? "all")}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Todo">To Do</SelectItem>
            <SelectItem value="InProgress">In Progress</SelectItem>
            <SelectItem value="Done">Done</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={currentParams.assigned_to ?? "all"}
          onValueChange={(v) => updateParam("assigned_to", v ?? "all")}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Assigned to" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(pathname)}
            className="text-muted-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

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
                  No tasks found
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
                      <Link
                        href={`/tasks/${task.id}`}
                        className="font-medium hover:underline"
                      >
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
                    <TableCell
                      className={cn("text-sm", isOverdue && "text-destructive font-medium")}
                    >
                      {formatDate(task.due_date)}
                    </TableCell>
                    <TableCell className="text-sm">{task.assigned_to.name}</TableCell>
                    <TableCell className="text-sm">
                      {task.lead ? (
                        <Link
                          href={`/leads/${task.lead.id}`}
                          className="text-primary hover:underline text-xs"
                        >
                          {task.lead.lead_number}
                        </Link>
                      ) : task.opportunity ? (
                        <Link
                          href={`/opportunities/${task.opportunity.id}`}
                          className="text-primary hover:underline text-xs"
                        >
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
    </div>
  );
}
