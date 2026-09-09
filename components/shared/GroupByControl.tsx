"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export type GroupOption = { value: string; label: string };

interface GroupByControlProps {
  options: GroupOption[];
  className?: string;
  /** Param name that carries the grouping field. Defaults to `group_by`. */
  paramKey?: string;
}

/**
 * Self-contained "Group by" dropdown. Writes the chosen field to the URL
 * (`group_by` by default), resetting pagination. Selecting "None" clears it.
 */
export function GroupByControl({ options, className, paramKey = "group_by" }: GroupByControlProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(paramKey) ?? "";

  const setGroup = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(paramKey, value);
    else params.delete(paramKey);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  };

  const activeLabel = options.find((o) => o.value === current)?.label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className={className}>
            <Layers className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">
              {activeLabel ? `Grouped: ${activeLabel}` : "Group by"}
            </span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuRadioGroup value={current} onValueChange={(v) => setGroup(String(v ?? ""))}>
          <DropdownMenuRadioItem value="">None</DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
