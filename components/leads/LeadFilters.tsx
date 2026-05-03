"use client";

import { useRouter, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { useCallback } from "react";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";

type User = { id: string; name: string };

interface LeadFiltersProps {
  users: User[];
  currentParams: {
    status?: string;
    temperature?: string;
    assigned_to?: string;
    search?: string;
  };
}

export function LeadFilters({ users, currentParams }: LeadFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(
        Object.entries(currentParams).filter(([, v]) => v) as [string, string][]
      );
      if (value && value !== "all") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, currentParams]
  );

  const handleSearch = useDebouncedCallback((value: string) => {
    updateParam("search", value);
  }, 400);

  const hasFilters =
    currentParams.status ||
    currentParams.temperature ||
    currentParams.assigned_to ||
    currentParams.search;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search name, phone, ID..."
          className="pl-8 w-56"
          defaultValue={currentParams.search ?? ""}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      <Select
        value={currentParams.status ?? "all"}
        onValueChange={(v) => updateParam("status", v ?? "all")}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="New">New</SelectItem>
          <SelectItem value="Prospect">Prospect</SelectItem>
          <SelectItem value="SiteVisitCompleted">Site Visit Completed</SelectItem>
          <SelectItem value="Negotiation">Negotiation</SelectItem>
          <SelectItem value="Won">Won</SelectItem>
          <SelectItem value="Lost">Lost</SelectItem>
          <SelectItem value="InvalidLead">Invalid Lead</SelectItem>
          <SelectItem value="OnHold">On Hold</SelectItem>
          <SelectItem value="Recycle">Recycle</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={currentParams.temperature ?? "all"}
        onValueChange={(v) => updateParam("temperature", v ?? "all")}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Temperature" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All temps</SelectItem>
          <SelectItem value="Hot">🔥 Hot</SelectItem>
          <SelectItem value="Warm">☀️ Warm</SelectItem>
          <SelectItem value="Cold">❄️ Cold</SelectItem>
          <SelectItem value="FollowUpLater">Later</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={currentParams.assigned_to ?? "all"}
        onValueChange={(v) => updateParam("assigned_to", v ?? "all")}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Assigned to" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All users</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(pathname)}
          className="text-muted-foreground"
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
