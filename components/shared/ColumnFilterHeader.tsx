"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowUpDown, ArrowUp, ArrowDown, ListFilter, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface FilterOption { label: string; value: string }

interface ColumnFilterHeaderProps {
  column?: string;
  label: string;
  currentSort?: string;
  currentDir?: string;
  onSort?: (col: string) => void;
  filterOptions?: FilterOption[];
  currentFilter?: string;
  filterParam?: string;
  onFilter?: (v: string | null) => void;
  className?: string;
}

export function ColumnFilterHeader({
  column, label, currentSort, currentDir, onSort,
  filterOptions, currentFilter, filterParam, onFilter,
  className,
}: ColumnFilterHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isActive = !!column && currentSort === column;
  const nextDir = isActive && currentDir === "asc" ? "desc" : "asc";
  const hasActiveFilter = !!currentFilter && currentFilter !== "all";

  const handleSort = () => {
    if (!column) return;
    if (onSort) {
      onSort(column);
    } else {
      const params = new URLSearchParams(searchParams.toString());
      params.set("sort", column);
      params.set("dir", nextDir);
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    }
  };

  const handleFilter = (value: string) => {
    if (onFilter) {
      onFilter(value === "all" ? null : value);
    } else if (filterParam) {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all") params.delete(filterParam);
      else params.set(filterParam, value);
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    }
  };

  const effectiveFilter = currentFilter ?? "all";

  return (
    <div className={cn("flex items-center gap-0.5 whitespace-nowrap", className)}>
      {column ? (
        <button
          onClick={handleSort}
          className="flex items-center gap-1 hover:text-foreground"
        >
          {label}
          {isActive ? (
            currentDir === "asc"
              ? <ArrowUp className="h-3 w-3" />
              : <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-40" />
          )}
        </button>
      ) : (
        <span>{label}</span>
      )}
      {filterOptions && (
        <Popover>
          <PopoverTrigger
            className={cn(
              "ml-0.5 rounded p-0.5 hover:bg-muted focus-visible:outline-none",
              hasActiveFilter ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ListFilter className="h-3 w-3" />
          </PopoverTrigger>
          <PopoverContent align="start" side="bottom" className="w-44 p-1">
            {[{ label: "All", value: "all" }, ...filterOptions].map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleFilter(opt.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted text-left",
                  effectiveFilter === opt.value && "font-medium text-primary"
                )}
              >
                <Check className={cn("h-3.5 w-3.5 shrink-0", effectiveFilter === opt.value ? "opacity-100" : "opacity-0")} />
                {opt.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
