"use client";

import { useState } from "react";
import { RevenueReport } from "./RevenueReport";
import { NetProfitReport } from "./NetProfitReport";
import { Button } from "@/components/ui/button";

interface Props {
  salesUsers: { id: string; name: string }[];
}

export function ReportsClient({ salesUsers }: Props) {
  const [tab, setTab] = useState<"revenue" | "net-profit">("revenue");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab("revenue")}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
            tab === "revenue"
              ? "border-violet-600 text-violet-600"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Revenue Report
        </button>
        <button
          onClick={() => setTab("net-profit")}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
            tab === "net-profit"
              ? "border-violet-600 text-violet-600"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Net Profit Report
        </button>
      </div>

      {tab === "revenue" && <RevenueReport salesUsers={salesUsers} />}
      {tab === "net-profit" && <NetProfitReport />}
    </div>
  );
}
