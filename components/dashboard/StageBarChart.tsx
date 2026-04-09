"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const STAGE_COLORS: Record<string, string> = {
  New: "#6366f1",
  Contacted: "#8b5cf6",
  Qualified: "#3b82f6",
  Requirement: "#06b6d4",
  OpportunityTagged: "#10b981",
  Visit: "#f59e0b",
  FollowUp: "#f97316",
  Negotiation: "#ef4444",
  Won: "#22c55e",
  Lost: "#6b7280",
  OnHold: "#94a3b8",
  Recycle: "#d97706",
};

interface StageBarChartProps {
  data: { stage: string; count: number }[];
}

export function StageBarChart({ data }: StageBarChartProps) {
  const sorted = [...data].sort((a, b) => b.count - a.count);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={sorted} margin={{ top: 4, right: 8, left: -16, bottom: 60 }}>
        <XAxis
          dataKey="stage"
          tick={{ fontSize: 11 }}
          angle={-40}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          formatter={(value) => [value, "Leads"]}
          labelStyle={{ fontWeight: 600 }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {sorted.map((entry, index) => (
            <Cell
              key={index}
              fill={STAGE_COLORS[entry.stage] ?? "#6366f1"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
