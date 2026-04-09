"use client";

import { useState, useEffect } from "react";
import { formatRelativeTime } from "@/lib/utils";
import { getInitials } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight,
  MessageSquare,
  Plus,
  Edit,
  AlertCircle,
} from "lucide-react";

type Activity = {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: { id: string; name: string; avatar_url: string | null };
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  stage_changed: <ArrowRight className="h-3 w-3" />,
  note_added: <MessageSquare className="h-3 w-3" />,
  lead_created: <Plus className="h-3 w-3" />,
  task_created: <Plus className="h-3 w-3" />,
  lead_updated: <Edit className="h-3 w-3" />,
};

const ACTION_LABELS: Record<string, (meta: Record<string, unknown>) => string> = {
  stage_changed: (m) => `Stage changed: ${m.from} → ${m.to}`,
  note_added: (m) => `Note: "${String(m.preview ?? "").slice(0, 60)}${String(m.preview ?? "").length > 60 ? "…" : ""}"`,
  lead_created: () => "Lead created",
  task_created: () => "Task linked",
  lead_updated: (m) =>
    `Updated: ${Array.isArray(m.fields) ? (m.fields as string[]).join(", ") : ""}`,
};

function getLabel(action: string, metadata: Record<string, unknown> | null): string {
  const fn = ACTION_LABELS[action];
  if (fn) return fn(metadata ?? {});
  return action.replace(/_/g, " ");
}

interface ActivityTimelineProps {
  entityType: "Lead" | "Task" | "Opportunity";
  entityId: string;
  apiPath: string;
}

export function ActivityTimeline({ entityId, apiPath }: ActivityTimelineProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiPath}?limit=20`)
      .then((r) => r.json())
      .then((d) => setActivities(d.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [entityId, apiPath]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-7 w-7 rounded-full shrink-0" />
            <div className="space-y-1 flex-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <AlertCircle className="h-4 w-4" />
        No activity yet
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {activities.map((activity, idx) => (
        <div key={activity.id} className="flex gap-3">
          {/* Timeline line */}
          <div className="flex flex-col items-center">
            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0">
              {ACTION_ICONS[activity.action] ?? (
                <span className="text-[10px] font-medium">
                  {getInitials(activity.actor.name)}
                </span>
              )}
            </div>
            {idx < activities.length - 1 && (
              <div className="w-px flex-1 bg-border mt-1 mb-1" />
            )}
          </div>
          {/* Content */}
          <div className="pb-4 flex-1 min-w-0">
            <p className="text-sm">
              <span className="font-medium">{activity.actor.name}</span>{" "}
              <span className="text-muted-foreground">
                {getLabel(activity.action, activity.metadata as Record<string, unknown>)}
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatRelativeTime(activity.created_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
