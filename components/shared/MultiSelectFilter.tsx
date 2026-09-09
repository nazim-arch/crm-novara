"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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
import { parseMulti } from "@/lib/list-params";

export type FilterOption = { value: string; label: string };

interface MultiSelectFilterProps {
  /** Field label shown above the control. */
  label: string;
  /** URL search param this filter reads/writes (comma-separated values). */
  paramKey: string;
  options: FilterOption[];
  /** Width/utility classes for the trigger button. */
  className?: string;
}

/**
 * Self-contained multi-select filter. Reads its own value from the URL and
 * writes a comma-separated param, resetting pagination. Drop-in replacement for
 * the single-select `Select` filters used across the list pages.
 */
export function MultiSelectFilter({ label, paramKey, options, className }: MultiSelectFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selected = parseMulti(searchParams.get(paramKey));
  const selectedSet = new Set(selected);

  const commit = useCallback(
    (values: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (values.length) params.set(paramKey, values.join(","));
      else params.delete(paramKey);
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams, paramKey]
  );

  const toggle = (value: string) => {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    // Preserve option order in the serialized value
    commit(options.filter((o) => next.has(o.value)).map((o) => o.value));
  };

  const count = selectedSet.size;
  const triggerText =
    count === 0
      ? `All ${label.toLowerCase()}`
      : count === 1
        ? options.find((o) => o.value === selected[0])?.label ?? "1 selected"
        : `${count} selected`;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className={cn("h-9 justify-between font-normal", className)}
            >
              <span className="truncate">{triggerText}</span>
              <ChevronDown className="h-4 w-4 opacity-50 ml-1 shrink-0" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-56 max-h-[60vh] overflow-y-auto">
          {options.map((opt) => (
            <DropdownMenuCheckboxItem
              key={opt.value}
              checked={selectedSet.has(opt.value)}
              closeOnClick={false}
              onCheckedChange={() => toggle(opt.value)}
            >
              {opt.label}
            </DropdownMenuCheckboxItem>
          ))}
          {count > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem closeOnClick={false} onClick={() => commit([])}>
                Clear
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
