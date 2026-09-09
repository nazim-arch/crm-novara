"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { useCallback } from "react";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { MultiSelectFilter, type FilterOption } from "@/components/shared/MultiSelectFilter";
import { GroupByControl } from "@/components/shared/GroupByControl";

type User = { id: string; name: string };
type Opp = { id: string; name: string; opp_number: string };

interface LeadFiltersProps {
  users: User[];
  leadSources: string[];
  opportunities: Opp[];
  /** Lead Source is a restricted dimension — only Admins may filter by it. */
  isAdmin?: boolean;
}

const STATUS_OPTIONS: FilterOption[] = [
  { label: "New", value: "New" },
  { label: "Contacted", value: "Contacted" },
  { label: "Prospect", value: "Prospect" },
  { label: "Site Visit Completed", value: "SiteVisitCompleted" },
  { label: "Negotiation", value: "Negotiation" },
  { label: "Booked", value: "Booked" },
  { label: "Won", value: "Won" },
  { label: "Lost", value: "Lost" },
  { label: "Invalid Lead", value: "InvalidLead" },
  { label: "On Hold", value: "OnHold" },
  { label: "Recycle", value: "Recycle" },
];

const TEMPERATURE_OPTIONS: FilterOption[] = [
  { label: "🔥 Hot", value: "Hot" },
  { label: "☀️ Warm", value: "Warm" },
  { label: "❄️ Cold", value: "Cold" },
  { label: "Later", value: "FollowUpLater" },
];

const ACTIVITY_STAGE_OPTIONS: FilterOption[] = [
  { label: "New", value: "New" },
  { label: "No Response", value: "NoResponse" },
  { label: "Busy", value: "Busy" },
  { label: "Unreachable", value: "Unreachable" },
  { label: "Prospect", value: "Prospect" },
  { label: "Call Back", value: "CallBack" },
  { label: "Follow-up", value: "FollowUp" },
  { label: "Site Visit Scheduled", value: "SiteVisitScheduled" },
  { label: "Long RNR", value: "LongRNR" },
  { label: "Not Interested", value: "NotInterested" },
  { label: "Junk", value: "Junk" },
];

const GROUP_OPTIONS = [
  { label: "Status", value: "status" },
  { label: "Opportunity", value: "opportunity" },
  { label: "Temperature", value: "temperature" },
  { label: "Assigned To", value: "assigned_to" },
  { label: "Follow-up", value: "followup" },
];

export function LeadFilters({ users, leadSources, opportunities, isAdmin = false }: LeadFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateSearch = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set("search", value);
      else params.delete("search");
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const handleSearch = useDebouncedCallback((value: string) => updateSearch(value), 400);

  const hasFilters = Array.from(searchParams.keys()).some((k) => k !== "page");

  return (
    <div className="flex flex-wrap gap-2 items-end">
      <div className="flex flex-col gap-1 w-full sm:w-56">
        <span className="text-[11px] font-medium text-muted-foreground">Search</span>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, phone, ID..."
            className="pl-8 w-full"
            defaultValue={searchParams.get("search") ?? ""}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>

      <MultiSelectFilter label="Status" paramKey="status" options={STATUS_OPTIONS} className="w-full sm:w-40" />
      <MultiSelectFilter label="Temperature" paramKey="temperature" options={TEMPERATURE_OPTIONS} className="w-full sm:w-36" />
      <MultiSelectFilter
        label="Assigned To"
        paramKey="assigned_to"
        options={users.map((u) => ({ label: u.name, value: u.id }))}
        className="w-full sm:w-44"
      />
      <MultiSelectFilter label="Activity Stage" paramKey="activity_stage" options={ACTIVITY_STAGE_OPTIONS} className="w-full sm:w-44" />
      <MultiSelectFilter
        label="Opportunity"
        paramKey="opportunity_id"
        options={opportunities.map((o) => ({ label: o.name, value: o.id }))}
        className="w-full sm:w-52"
      />
      {isAdmin && leadSources.length > 0 && (
        <MultiSelectFilter
          label="Lead Source"
          paramKey="source"
          options={leadSources.map((s) => ({ label: s, value: s }))}
          className="w-full sm:w-44"
        />
      )}

      <div className="flex items-center gap-2">
        <GroupByControl options={GROUP_OPTIONS} />
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
    </div>
  );
}
