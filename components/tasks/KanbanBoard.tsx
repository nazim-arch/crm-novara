"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { TaskStatusBadge, PriorityBadge } from "@/components/shared/LeadStatusBadge";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  task_number: string;
  title: string;
  status: string;
  priority: string;
  due_date: Date;
  assigned_to: { id: string; name: string };
  lead: { id: string; lead_number: string; full_name: string } | null;
};

const COLUMNS = [
  { id: "Todo", label: "To Do" },
  { id: "InProgress", label: "In Progress" },
  { id: "Done", label: "Done" },
  { id: "Cancelled", label: "Cancelled" },
] as const;

export function KanbanBoard({ tasks }: { tasks: Task[] }) {
  const router = useRouter();
  const [dragging, setDragging] = useState<string | null>(null);
  const [localTasks, setLocalTasks] = useState(tasks);

  const getColumnTasks = (status: string) =>
    localTasks.filter((t) => t.status === status);

  const handleDrop = async (taskId: string, newStatus: string) => {
    const task = localTasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    // Optimistic update
    setLocalTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        // Revert
        setLocalTasks(tasks);
        toast.error("Failed to update task");
      } else {
        router.refresh();
      }
    } catch {
      setLocalTasks(tasks);
      toast.error("Something went wrong");
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COLUMNS.map((col) => {
        const colTasks = getColumnTasks(col.id);
        return (
          <div
            key={col.id}
            className="flex-1 min-w-64"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const taskId = e.dataTransfer.getData("taskId");
              handleDrop(taskId, col.id);
            }}
          >
            {/* Column header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TaskStatusBadge status={col.id} />
                <span className="text-sm text-muted-foreground">
                  {colTasks.length}
                </span>
              </div>
            </div>

            {/* Cards */}
            <div className="space-y-2 min-h-32">
              {colTasks.map((task) => {
                const isOverdue =
                  new Date(task.due_date) < new Date() &&
                  !["Done", "Cancelled"].includes(task.status);
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("taskId", task.id);
                      setDragging(task.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    className={cn(
                      "bg-card border rounded-lg p-3 cursor-grab active:cursor-grabbing transition-shadow",
                      dragging === task.id && "opacity-50 shadow-lg",
                      "hover:shadow-sm"
                    )}
                  >
                    <Link href={`/tasks/${task.id}`} className="block">
                      <p className="font-medium text-sm leading-snug">{task.title}</p>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <PriorityBadge priority={task.priority} />
                        <span
                          className={cn(
                            "text-xs text-muted-foreground",
                            isOverdue && "text-destructive font-medium"
                          )}
                        >
                          {formatDate(task.due_date)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground">
                          {task.assigned_to.name}
                        </span>
                        {task.lead && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {task.lead.lead_number}
                          </span>
                        )}
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
