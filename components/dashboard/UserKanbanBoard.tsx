"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import { PriorityBadge, TaskStatusBadge } from "@/components/shared/LeadStatusBadge";

type ActiveTask = {
  id: string;
  task_number: string;
  title: string;
  status: string;
  priority: string;
  due_date: Date;
  assigned_to_id: string;
  lead: { lead_number: string } | null;
  client: { name: string } | null;
};

type User = { id: string; name: string };

interface Props {
  users: User[];
  initialTasks: ActiveTask[];
}

export function UserKanbanBoard({ users, initialTasks }: Props) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [dragging, setDragging] = useState<string | null>(null);

  const userTasks = (userId: string) => tasks.filter(t => t.assigned_to_id === userId);

  // Only show users who have tasks
  const activeUsers = users.filter(u => tasks.some(t => t.assigned_to_id === u.id));

  async function handleDrop(taskId: string, newUserId: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.assigned_to_id === newUserId) return;

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, assigned_to_id: newUserId } : t));

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to_id: newUserId }),
      });
      if (!res.ok) {
        setTasks(initialTasks);
        toast.error("Failed to reassign task");
      } else {
        toast.success("Task reassigned");
        router.refresh();
      }
    } catch {
      setTasks(initialTasks);
      toast.error("Something went wrong");
    }
  }

  if (activeUsers.length === 0) {
    return <p className="text-sm text-muted-foreground">No active tasks to display.</p>;
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {activeUsers.map(user => {
        const colTasks = userTasks(user.id);
        return (
          <div
            key={user.id}
            className="flex-shrink-0 w-64"
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const taskId = e.dataTransfer.getData("taskId");
              handleDrop(taskId, user.id);
            }}
          >
            {/* Column header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium truncate max-w-36">{user.name}</span>
              </div>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                {colTasks.length}
              </span>
            </div>

            {/* Task cards */}
            <div className="space-y-2 min-h-24">
              {colTasks.length === 0 ? (
                <div className="border-2 border-dashed rounded-lg h-16 flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">Drop here</span>
                </div>
              ) : (
                colTasks.map(task => {
                  const isOverdue = new Date(task.due_date) < new Date() && !["Done", "Cancelled"].includes(task.status);
                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData("taskId", task.id);
                        setDragging(task.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                      className={cn(
                        "bg-card border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow",
                        dragging === task.id && "opacity-50 shadow-lg"
                      )}
                    >
                      <Link href={`/tasks/${task.id}`} className="block" onClick={e => e.stopPropagation()}>
                        <p className="text-sm font-medium leading-snug line-clamp-2">{task.title}</p>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <TaskStatusBadge status={task.status} />
                          <PriorityBadge priority={task.priority} />
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className={cn("text-xs", isOverdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                            {formatDate(task.due_date)}
                          </span>
                          {task.lead && (
                            <span className="text-xs text-muted-foreground font-mono">{task.lead.lead_number}</span>
                          )}
                          {task.client && !task.lead && (
                            <span className="text-xs text-muted-foreground truncate max-w-20">{task.client.name}</span>
                          )}
                        </div>
                      </Link>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
