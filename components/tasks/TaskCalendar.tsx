"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, format, addMonths, subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Task = {
  id: string;
  task_number: string;
  title: string;
  status: string;
  priority: string;
  due_date: Date;
};

const PRIORITY_DOT: Record<string, string> = {
  Critical: "bg-red-500",
  High: "bg-orange-500",
  Medium: "bg-blue-500",
  Low: "bg-slate-400",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function TaskCalendar({ tasks }: { tasks: Task[] }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date | null>(null);

  // Index tasks by their due date (yyyy-MM-dd) for O(1) day lookups.
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const key = format(new Date(t.due_date), "yyyy-MM-dd");
      const list = map.get(key);
      if (list) list.push(t);
      else map.set(key, [t]);
    }
    return map;
  }, [tasks]);

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(month));
    const gridEnd = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [month]);

  const today = new Date();
  const selectedKey = selected ? format(selected, "yyyy-MM-dd") : null;
  const selectedTasks = selectedKey ? byDay.get(selectedKey) ?? [] : [];

  const isDone = (t: Task) => t.status === "Done" || t.status === "Cancelled";

  return (
    <div className="space-y-4">
      {/* Month header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{format(month, "MMMM yyyy")}</h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
          <Button variant="outline" size="icon-sm" onClick={() => setMonth((m) => subMonths(m, 1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks = byDay.get(key) ?? [];
            const inMonth = isSameMonth(day, month);
            const isToday = isSameDay(day, today);
            const isSelected = selected && isSameDay(day, selected);
            const overdueCount = dayTasks.filter((t) => !isDone(t) && day < new Date(today.getFullYear(), today.getMonth(), today.getDate())).length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(day)}
                className={cn(
                  "min-h-20 border-b border-r p-1.5 text-left align-top transition-colors last:border-r-0 hover:bg-muted/40",
                  !inMonth && "bg-muted/20 text-muted-foreground",
                  isSelected && "ring-2 ring-primary ring-inset",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn(
                    "text-xs tabular-nums",
                    isToday && "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold",
                  )}>
                    {format(day, "d")}
                  </span>
                  {dayTasks.length > 0 && (
                    <span className={cn("text-[10px] font-medium", overdueCount > 0 ? "text-destructive" : "text-muted-foreground")}>
                      {dayTasks.length}
                    </span>
                  )}
                </div>
                <div className="mt-1 space-y-0.5">
                  {dayTasks.slice(0, 3).map((t) => (
                    <div key={t.id} className="flex items-center gap-1 truncate">
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_DOT[t.priority] ?? "bg-slate-400")} />
                      <span className={cn("truncate text-[11px]", isDone(t) && "line-through text-muted-foreground")}>{t.title}</span>
                    </div>
                  ))}
                  {dayTasks.length > 3 && (
                    <span className="text-[10px] text-muted-foreground">+{dayTasks.length - 3} more</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selected && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-2">{format(selected, "EEEE, d MMM yyyy")}</h3>
          {selectedTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks due on this day.</p>
          ) : (
            <div className="space-y-1.5">
              {selectedTasks.map((t) => (
                <Link
                  key={t.id}
                  href={`/tasks/${t.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted transition-colors"
                >
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[t.priority] ?? "bg-slate-400")} />
                  <span className={cn("text-sm flex-1 truncate", isDone(t) && "line-through text-muted-foreground")}>{t.title}</span>
                  <span className="text-xs text-muted-foreground font-mono">{t.task_number}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
