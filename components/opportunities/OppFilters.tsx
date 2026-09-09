"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { MultiSelectFilter, type FilterOption } from "@/components/shared/MultiSelectFilter";
import { GroupByControl } from "@/components/shared/GroupByControl";

const STATUS_OPTIONS: FilterOption[] = [
  { label: "Active", value: "Active" },
  { label: "Inactive", value: "Inactive" },
  { label: "Sold", value: "Sold" },
];

const PROPERTY_TYPE_OPTIONS: FilterOption[] = [
  { label: "Residential", value: "Residential" },
  { label: "Commercial", value: "Commercial" },
  { label: "Plot", value: "Plot" },
  { label: "Villa", value: "Villa" },
  { label: "Apartment", value: "Apartment" },
  { label: "Office", value: "Office" },
  { label: "Land", value: "Land" },
];

const OPP_BY_OPTIONS: FilterOption[] = [
  { label: "Developer", value: "Developer" },
  { label: "Seller", value: "Seller" },
  { label: "Buyer", value: "Buyer" },
];

const GROUP_OPTIONS = [
  { label: "Status", value: "status" },
  { label: "Property Type", value: "property_type" },
  { label: "Location", value: "location" },
  { label: "Developer", value: "developer" },
];

export function OppFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSearch = useDebouncedCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("search", value);
    else params.delete("search");
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }, 300);

  return (
    <div className="flex flex-wrap gap-2 items-end">
      <div className="flex flex-col gap-1 w-full sm:w-56">
        <span className="text-[11px] font-medium text-muted-foreground">Search</span>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search name, project, location…"
            defaultValue={searchParams.get("search") ?? ""}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      <MultiSelectFilter label="Status" paramKey="status" options={STATUS_OPTIONS} className="w-full sm:w-40" />
      <MultiSelectFilter label="Property Type" paramKey="property_type" options={PROPERTY_TYPE_OPTIONS} className="w-full sm:w-44" />
      <MultiSelectFilter label="Opp By" paramKey="opportunity_by" options={OPP_BY_OPTIONS} className="w-full sm:w-40" />

      <GroupByControl options={GROUP_OPTIONS} />
    </div>
  );
}
