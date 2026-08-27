"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { parseChecklist, type ChecklistItem } from "@/lib/checklist";

export function TaskChecklistCard({
  taskId,
  initial,
  canEdit,
}: {
  taskId: string;
  initial: unknown;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [items, setItems] = useState<ChecklistItem[]>(() => parseChecklist(initial));
  const [saving, setSaving] = useState(false);

  if (items.length === 0) return null;

  const done = items.filter((i) => i.done).length;
  const pct = Math.round((done / items.length) * 100);

  async function persist(next: ChecklistItem[]) {
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist: next }),
      });
      if (!res.ok) {
        const r = await res.json().catch(() => ({}));
        toast.error(r.error ?? "Failed to update checklist");
        setItems(parseChecklist(initial)); // revert
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      toast.error("Something went wrong");
      setItems(parseChecklist(initial));
    } finally {
      setSaving(false);
    }
  }

  const toggle = (idx: number) => {
    if (!canEdit || saving) return;
    const next = items.map((it, i) => (i === idx ? { ...it, done: !it.done } : it));
    setItems(next);
    persist(next);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Checklist</CardTitle>
          <span className="text-xs text-muted-foreground tabular-nums">{done}/{items.length}</span>
        </div>
        <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-muted">
          <span
            className={cn("block h-full transition-all", done === items.length ? "bg-emerald-500" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item, idx) => (
          <label key={idx} className={cn("flex items-start gap-2 text-sm", canEdit ? "cursor-pointer" : "cursor-default")}>
            <Checkbox
              checked={item.done}
              disabled={!canEdit || saving}
              onCheckedChange={() => toggle(idx)}
              className="mt-0.5"
            />
            <span className={cn(item.done && "line-through text-muted-foreground")}>{item.text}</span>
          </label>
        ))}
      </CardContent>
    </Card>
  );
}
