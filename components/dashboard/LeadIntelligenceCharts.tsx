"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, Tooltip, Legend,
} from "recharts";

// Recharts (+ its d3 deps) is heavy; this whole module is loaded lazily via
// next/dynamic from the dashboards so it never lands in the landing-page bundle.

interface StageRow { stage: string; count: number; value: number }
interface TempRow { temp: string | null; count: number }
interface SourceRow { source: string | null; count: number }

interface Props {
  stageDistribution: StageRow[];
  temperatureDistribution: TempRow[];
  sourceDistribution: SourceRow[];
}

function fc(n: number) {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

const TEMP_COLOR: Record<string, string> = {
  Hot: "#ef4444",
  Warm: "#f97316",
  Cold: "#3b82f6",
  FollowUpLater: "#a855f7",
};

const STAGE_ORDER = [
  "New", "Prospect", "SiteVisitCompleted", "Negotiation", "Booked",
  "Won", "Lost", "OnHold", "Recycle", "InvalidLead",
];

export function LeadIntelligenceCharts({
  stageDistribution, temperatureDistribution, sourceDistribution,
}: Props) {
  const [activePieIndex, setActivePieIndex] = useState<number | undefined>(undefined);

  const sortedStages = [...stageDistribution].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)
  );

  const tempData = temperatureDistribution.map((t) => ({
    name: t.temp ?? "Unknown",
    value: t.count,
    color: TEMP_COLOR[t.temp ?? ""] ?? "#94a3b8",
  }));

  const sourceData = sourceDistribution.map((s) => ({
    name: s.source ?? "Unknown",
    value: s.count,
  }));

  const tooltipStyle = {
    fontSize: 12, borderRadius: 8,
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--popover))",
    color: "hsl(var(--popover-foreground))",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    padding: "8px 12px",
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Stage Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={sortedStages} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={30} />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(val, name) => name === "value" ? [fc(Number(val)), "Pipeline Value"] : [val, "Leads"]}
                labelStyle={{ fontWeight: 600, marginBottom: 4 }}
              />
              <Bar dataKey="count" name="Leads" fill="#3b82f6" radius={[3, 3, 0, 0]} cursor="pointer" activeBar={{ fill: "#2563eb", opacity: 1 }} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Temperature Split</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={tempData}
                cx="50%" cy="50%"
                innerRadius={50} outerRadius={75} paddingAngle={3}
                dataKey="value"
                onMouseEnter={(_, index) => setActivePieIndex(index)}
                onMouseLeave={() => setActivePieIndex(undefined)}
                cursor="pointer"
              >
                {tempData.map((entry, i) => (
                  <Cell key={i} fill={entry.color}
                    opacity={activePieIndex === undefined || activePieIndex === i ? 1 : 0.45}
                    style={{ transition: "opacity 0.15s ease, r 0.15s ease" }}
                  />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(val) => [val, "Leads"]} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Lead Sources (Top 8)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={sourceData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 80 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={78} />
              <Tooltip contentStyle={tooltipStyle} formatter={(val) => [val, "Leads"]} />
              <Bar dataKey="value" name="Leads" fill="#8b5cf6" radius={[0, 3, 3, 0]} cursor="pointer" activeBar={{ fill: "#7c3aed", opacity: 1 }} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
