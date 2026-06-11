"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Columns3 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type PickerColumn = { id: string; label: string; locked?: boolean };

interface ColumnPickerProps {
  listKey: string; // e.g. "leads" → stored as preference key "columns:leads"
  columns: PickerColumn[];
  visible: string[];
  /** Controlled mode (client tables): receive changes instead of router.refresh() */
  onVisibleChange?: (ids: string[]) => void;
  className?: string;
}

export function ColumnPicker({
  listKey,
  columns,
  visible,
  onVisibleChange,
  className,
}: ColumnPickerProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(visible));
  const [, startTransition] = useTransition();

  const persist = async (ids: string[]) => {
    try {
      const res = await fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: `columns:${listKey}`, value: ids }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Could not save column preferences");
    }
  };

  const apply = (next: Set<string>) => {
    setSelected(next);
    // Keep column-definition order in the stored array
    const ids = columns.filter((c) => next.has(c.id)).map((c) => c.id);
    if (onVisibleChange) onVisibleChange(ids);
    void persist(ids).then(() => {
      if (!onVisibleChange) startTransition(() => router.refresh());
    });
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  };

  const reset = () => {
    apply(new Set(columns.map((c) => c.id)));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className={className}>
            <Columns3 className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Columns</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((col) => (
          <DropdownMenuCheckboxItem
            key={col.id}
            checked={col.locked || selected.has(col.id)}
            disabled={col.locked}
            closeOnClick={false}
            onCheckedChange={() => toggle(col.id)}
          >
            {col.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem closeOnClick={false} onClick={reset}>
          Show all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
