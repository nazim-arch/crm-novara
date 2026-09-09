"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export type ControlledOption = { label: string; value: string };

interface ControlledMultiSelectProps {
  /** Plural noun for the "All …" empty state, e.g. "assignees". */
  label: string;
  options: ControlledOption[];
  values: string[];
  onChange: (next: string[]) => void;
  /** Width utility classes for the trigger button. */
  width?: string;
}

/**
 * React-state (controlled) multi-select dropdown for client-side list filters
 * that hold their selection in component state rather than the URL.
 */
export function ControlledMultiSelect({ label, options, values, onChange, width }: ControlledMultiSelectProps) {
  const set = new Set(values);
  const count = values.length;
  const toggle = (v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(options.filter((o) => next.has(o.value)).map((o) => o.value));
  };
  const triggerText =
    count === 0
      ? `All ${label.toLowerCase()}`
      : count === 1
        ? options.find((o) => o.value === values[0])?.label ?? "1 selected"
        : `${count} selected`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className={cn("h-9 justify-between font-normal", width)}>
            <span className="truncate">{triggerText}</span>
            <ChevronDown className="h-4 w-4 opacity-50 ml-1 shrink-0" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-52 max-h-[60vh] overflow-y-auto">
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={set.has(o.value)}
            closeOnClick={false}
            onCheckedChange={() => toggle(o.value)}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
        {count > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem closeOnClick={false} onClick={() => onChange([])}>
              Clear
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
