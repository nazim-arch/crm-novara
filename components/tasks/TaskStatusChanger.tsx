"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const STATUSES = [
  { value: "Todo", label: "To Do" },
  { value: "InProgress", label: "In Progress" },
  { value: "Done", label: "Done" },
  { value: "Cancelled", label: "Cancelled" },
];

interface TaskStatusChangerProps {
  taskId: string;
  currentStatus: string;
}

export function TaskStatusChanger({ taskId, currentStatus }: TaskStatusChangerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleChange = async (newStatus: string) => {
    if (newStatus === currentStatus) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error ?? "Failed to update status");
        return;
      }
      toast.success("Status updated");
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Label className="text-sm text-muted-foreground shrink-0">Status</Label>
      <Select
        defaultValue={currentStatus}
        onValueChange={(v) => v && handleChange(v)}
        disabled={loading}
      >
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
