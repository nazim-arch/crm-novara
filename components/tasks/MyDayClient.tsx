"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { PriorityBadge } from "@/components/shared/LeadStatusBadge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import { parseChecklist, checklistProgress } from "@/lib/checklist";
import { startOfDay, endOfDay } from "date-fns";
import { CheckCircle2, ChevronDown, ChevronRight, ListChecks, Sun } from "lucide-react";

type Task = {
  id: string;
  task_number: string;
  title: string;
  priority: string;
  status: string;
  due_date: string;
  checklist?: unknown;
  lead: { id: string; lead_number: string; full_name: string } | null;
  opportunity: { id: string; opp_number: string; name: string } | null;
  client: { id: string; name: string } | null;
};

const PRIORITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export function MyDayClient({
  tasks: initial,
  completedToday,
  todayISO,
}: {
  tasks: Task[];
  completedToday: number;
  todayISO: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tasks, setTasks] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const todayStart = startOfDay(new Date(todayISO));
  const todayEnd = endOfDay(new Date(todayISO));

  const buckets = useMemo(() => {
    const sortByPriority = (a: Task, b: Task) =>
      (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
      new Date(a.due_date).getTime() - new Date(b.due_date).getTime();

    const overdue = tasks.filter((t) => new Date(t.due_date) < todayStart).sort(sortByPriority);
    const today = tasks
      .filter((t) => new Date(t.due_date) >= todayStart && new Date(t.due_date) <= todayEnd)
      .sort(sortByPriority);
    const upcoming = tasks.filter((t) => new Date(t.due_date) > todayEnd).sort(sortByPriority);
    return { overdue, today, upcoming };
  }, [tasks, todayStart, todayEnd]);

  async function complete(id: string) {
    setBusy(id);
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
      setTasks((prev) => prev.filter((t) => t.id !== id));
      toast.success("Task completed");
      startTransition(() => router.refresh());
    } catch {
      toast.error("Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function toggleChecklistItem(task: Task, idx: number) {
    const items = parseChecklist(task.checklist);
    const next = items.map((it, i) => (i === idx ? { ...it, done: !it.done } : it));
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, checklist: next } : t)));
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist: next }),
      });
      if (!res.ok) {
        toast.error("Failed to update checklist");
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, checklist: items } : t)));
      }
    } catch {
      toast.error("Something went wrong");
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, checklist: items } : t)));
    }
  }

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const total = tasks.length;

  const Section = ({ title, items, tone }: { title: string; items: Task[]; tone?: "danger" | "default" }) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className={cn("text-sm font-semibold", tone === "danger" && "text-destructive")}>{title}</h2>
          <span className="text-xs text-muted-foreground">({items.length})</span>
        </div>
        <div className="space-y-2">
          {items.map((task) => {
            const clItems = parseChecklist(task.checklist);
            const progress = checklistProgress(task.checklist);
            const isOverdue = new Date(task.due_date) < todayStart;
            const isExpanded = expanded.has(task.id);
            return (
              <Card key={task.id}>
                <CardContent className="py-3">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      disabled={busy === task.id}
                      onClick={() => complete(task.id)}
                      title="Mark done"
                      className="mt-0.5 text-muted-foreground hover:text-emerald-600 transition-colors disabled:opacity-40"
                    >
                      <CheckCircle2 className="h-5 w-5" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/tasks/${task.id}`} className="font-medium hover:underline">{task.title}</Link>
                        <PriorityBadge priority={task.priority} />
                        <span className={cn("text-xs", isOverdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                          {formatDate(task.due_date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-1 text-xs text-muted-foreground">
                        <span className="font-mono">{task.task_number}</span>
                        {task.client && <span className="text-indigo-600 dark:text-indigo-400">{task.client.name}</span>}
                        {task.lead && (
                          <Link href={`/leads/${task.lead.id}`} className="text-primary hover:underline">{task.lead.lead_number}</Link>
                        )}
                        {task.opportunity && (
                          <Link href={`/opportunities/${task.opportunity.id}`} className="text-primary hover:underline">{task.opportunity.opp_number}</Link>
                        )}
                        {progress && (
                          <button
                            type="button"
                            onClick={() => toggleExpand(task.id)}
                            className="inline-flex items-center gap-1 hover:text-foreground"
                          >
                            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            <ListChecks className={cn("h-3 w-3", progress.done === progress.total && "text-emerald-600")} />
                            {progress.done}/{progress.total}
                          </button>
                        )}
                      </div>
                      {isExpanded && clItems.length > 0 && (
                        <div className="mt-2 space-y-1.5 border-l pl-3">
                          {clItems.map((item, idx) => (
                            <label key={idx} className="flex items-start gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={item.done}
                                onCheckedChange={() => toggleChecklistItem(task, idx)}
                                className="mt-0.5"
                              />
                              <span className={cn(item.done && "line-through text-muted-foreground")}>{item.text}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Card className="flex-1 min-w-40">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Open tasks (7-day horizon)</p>
            <p className="text-2xl font-bold">{total}</p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-40">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Overdue</p>
            <p className={cn("text-2xl font-bold", buckets.overdue.length > 0 && "text-destructive")}>{buckets.overdue.length}</p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-40">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Completed today</p>
            <p className="text-2xl font-bold text-emerald-600">{completedToday}</p>
          </CardContent>
        </Card>
      </div>

      {total === 0 ? (
        <Card>
          <EmptyState icon={Sun} title="You're all caught up" description="No overdue or upcoming tasks in the next 7 days." />
        </Card>
      ) : (
        <>
          <Section title="Overdue" items={buckets.overdue} tone="danger" />
          <Section title="Today" items={buckets.today} />
          <Section title="Next 7 Days" items={buckets.upcoming} />
        </>
      )}
    </div>
  );
}
