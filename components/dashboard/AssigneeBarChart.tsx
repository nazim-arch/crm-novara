"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface AssigneeBarChartProps {
  data: { name: string; count: number }[];
}

export function AssigneeBarChart({ data }: AssigneeBarChartProps) {
  const sorted = [...data].sort((a, b) => b.count - a.count).slice(0, 10);

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 24, left: 60, bottom: 4 }}>
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={56} />
        <Tooltip
          formatter={(value) => [value, "Tasks"]}
          labelStyle={{ fontWeight: 600 }}
        />
        <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
