"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, Tooltip, Legend,
} from "recharts";

// Lazily loaded from SalesDashboardClient so recharts (+ d3) stays out of the
// Sales landing-page bundle. All three charts share this one chunk.

const tooltipStyle = {
  fontSize: 12, borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: "8px 12px",
};

type OppRow = { id?: string; name: string; count: number };
type SourceRow = { source: string | null; count: number };
type TempRow = { name: string; value: number; color: string };

export function SalesLeadsByOpportunityChart({ data }: { data: OppRow[] }) {
  const router = useRouter();
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 4 }}>
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, "Leads"]} />
        <Bar dataKey="count" fill="#6366f1" radius={[0, 3, 3, 0]} cursor="pointer" activeBar={{ fill: "#4f46e5" }}
          onClick={(d: { name?: string }) => {
            const oppId = data.find((o) => o.name === d.name)?.id;
            if (oppId) router.push(`/leads?opportunity_id=${oppId}`);
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SalesSourceChart({ data }: { data: SourceRow[] }) {
  const router = useRouter();
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data.map((s) => ({ name: s.source ?? "Unknown", value: s.count }))}
        layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 4 }}
      >
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, "Leads"]} />
        <Bar dataKey="value" fill="#8b5cf6" radius={[0, 3, 3, 0]} cursor="pointer" activeBar={{ fill: "#7c3aed" }}
          onClick={(d: { name?: string }) => {
            if (d.name && d.name !== "Unknown")
              router.push(`/leads?source=${encodeURIComponent(d.name)}`);
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SalesTemperatureChart({ data }: { data: TempRow[] }) {
  const router = useRouter();
  const [activePieIndex, setActivePieIndex] = useState<number | undefined>(undefined);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%" cy="50%"
          innerRadius={55} outerRadius={80} paddingAngle={3}
          dataKey="value" cursor="pointer"
          onMouseEnter={(_, i) => setActivePieIndex(i)}
          onMouseLeave={() => setActivePieIndex(undefined)}
          onClick={(d) => {
            if (d?.name && d.name !== "Unknown") router.push(`/leads?temperature=${d.name}`);
          }}
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color}
              opacity={activePieIndex === undefined || activePieIndex === i ? 1 : 0.35}
              style={{ transition: "opacity 0.15s ease" }}
            />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, "Leads"]} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
