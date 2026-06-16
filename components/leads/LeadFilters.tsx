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
  leadSources: string[];
  currentParams: {
    status?: string;
    temperature?: string;
    assigned_to?: string;
    search?: string;
    filter?: string;
    source?: string;
    activity_stage?: string;
  };
}

export function LeadFilters({ users, leadSources, currentParams }: LeadFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();

  const { status, temperature, assigned_to, search, filter, source, activity_stage } = currentParams;

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(
        Object.entries({ status, temperature, assigned_to, search, filter, source, activity_stage })
          .filter(([, v]) => v) as [string, string][]
      );
      if (value && value !== "all") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, status, temperature, assigned_to, search, filter, source, activity_stage]
  );

  const handleSearch = useDebouncedCallback((value: string) => {
    updateParam("search", value);
  }, 400);

  const hasFilters =
    currentParams.status ||
    currentParams.temperature ||
    currentParams.assigned_to ||
    currentParams.search ||
    currentParams.filter ||
    currentParams.source ||
    currentParams.activity_stage;

  return (
    <div className="flex flex-wrap gap-2 items-end">
      <div className="flex flex-col gap-1 w-full sm:w-56">
        <span className="text-[11px] font-medium text-muted-foreground">Search</span>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, phone, ID..."
            className="pl-8 w-full"
            defaultValue={currentParams.search ?? ""}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1 w-full sm:w-40">
        <span className="text-[11px] font-medium text-muted-foreground">Status</span>
        <Select
          value={currentParams.status ?? "all"}
          onValueChange={(v) => updateParam("status", v ?? "all")}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="New">New</SelectItem>
            <SelectItem value="Contacted">Contacted</SelectItem>
            <SelectItem value="Prospect">Prospect</SelectItem>
            <SelectItem value="SiteVisitCompleted">Site Visit Completed</SelectItem>
            <SelectItem value="Negotiation">Negotiation</SelectItem>
            <SelectItem value="Booked">Booked</SelectItem>
            <SelectItem value="Won">Won</SelectItem>
            <SelectItem value="Lost">Lost</SelectItem>
            <SelectItem value="InvalidLead">Invalid Lead</SelectItem>
            <SelectItem value="OnHold">On Hold</SelectItem>
            <SelectItem value="Recycle">Recycle</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1 w-full sm:w-36">
        <span className="text-[11px] font-medium text-muted-foreground">Temperature</span>
        <Select
          value={currentParams.temperature ?? "all"}
          onValueChange={(v) => updateParam("temperature", v ?? "all")}
        >
          <SelectTrigger className="w-full">
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
      </div>

      <div className="flex flex-col gap-1 w-full sm:w-44">
        <span className="text-[11px] font-medium text-muted-foreground">Assigned To</span>
        <Select
          value={currentParams.assigned_to ?? "all"}
          onValueChange={(v) => updateParam("assigned_to", v ?? "all")}
        >
          <SelectTrigger className="w-full">
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
      </div>

      <div className="flex flex-col gap-1 w-full sm:w-44">
        <span className="text-[11px] font-medium text-muted-foreground">Activity Stage</span>
        <Select
          value={currentParams.activity_stage ?? "all"}
          onValueChange={(v) => updateParam("activity_stage", v ?? "all")}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Activity stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All activity stages</SelectItem>
            <SelectItem value="New">New</SelectItem>
            <SelectItem value="NoResponse">No Response</SelectItem>
            <SelectItem value="Busy">Busy</SelectItem>
            <SelectItem value="Unreachable">Unreachable</SelectItem>
            <SelectItem value="Prospect">Prospect</SelectItem>
            <SelectItem value="CallBack">Call Back</SelectItem>
            <SelectItem value="FollowUp">Follow-up</SelectItem>
            <SelectItem value="SiteVisitScheduled">Site Visit Scheduled</SelectItem>
            <SelectItem value="LongRNR">Long RNR</SelectItem>
            <SelectItem value="NotInterested">Not Interested</SelectItem>
            <SelectItem value="Junk">Junk</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {leadSources.length > 0 && (
        <div className="flex flex-col gap-1 w-full sm:w-44">
          <span className="text-[11px] font-medium text-muted-foreground">Lead Source</span>
          <Select
            value={currentParams.source ?? "all"}
            onValueChange={(v) => updateParam("source", v ?? "all")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Lead source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {leadSources.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

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
