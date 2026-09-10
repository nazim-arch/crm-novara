"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// Lazily imported (next/dynamic) by the builder so recharts stays out of the
// report-builder page bundle until an aggregate result is charted.
export function ReportBarChart({ data, valueLabel }: { data: { name: string; value: number }[]; valueLabel: string }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
        <Tooltip formatter={(v) => [v, valueLabel]} />
        <Bar dataKey="value" fill="#6366f1" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
