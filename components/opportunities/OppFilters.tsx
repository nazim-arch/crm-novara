"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import { useCallback } from "react";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";

interface OppFiltersProps {
  currentSearch?: string;
  currentStatus?: string;
}

export function OppFilters({ currentSearch, currentStatus }: OppFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") params.set(key, value);
      else params.delete(key);
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const handleSearch = useDebouncedCallback((value: string) => {
    updateParam("search", value);
  }, 300);

  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
      <div className="flex flex-col gap-1 flex-1">
        <span className="text-[11px] font-medium text-muted-foreground">Search</span>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search name, project, location…"
            defaultValue={currentSearch ?? ""}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Status</span>
        <Select
          value={currentStatus ?? "all"}
          onValueChange={(v) => v && updateParam("status", v)}
        >
          <SelectTrigger className="h-9 sm:w-40 text-sm">
            <SelectValue>
              {currentStatus && currentStatus !== "all" ? currentStatus : "All statuses"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
            <SelectItem value="Sold">Sold</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
