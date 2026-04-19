"use client";

import { cn } from "@/lib/utils";
import type { CommissionStatus } from "@/lib/sales-commission";

const BADGE_STYLES: Record<CommissionStatus, string> = {
  "Above Target": "bg-emerald-100 text-emerald-700",
  "On Track": "bg-amber-100 text-amber-700",
  "Below Target": "bg-red-100 text-red-700",
  "No Target": "bg-gray-100 text-gray-500",
};

export function CommissionStatusBadge({ status }: { status: CommissionStatus }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", BADGE_STYLES[status])}>
      {status}
    </span>
  );
}
