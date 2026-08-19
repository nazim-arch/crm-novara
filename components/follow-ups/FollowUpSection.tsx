"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ActionModal } from "@/components/ui/action-modal";
import { PriorityBadge } from "@/components/shared/LeadStatusBadge";
import { formatDate, formatDateTime } from "@/lib/utils";
import { differenceInCalendarDays, startOfDay } from "date-fns";
import {
  Phone, Mail, MessageCircle, Home, Users, Zap, Flame,
  Check, Plus, Trash2, Loader2, Clock, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const FOLLOW_UP_TYPES = ["Call", "Email", "WhatsApp", "Visit", "Meeting", "Activity", "Internal"] as const;

type FollowUp = {
  id: string;
  type: string;
  priority: string;
  status: string;
  scheduled_at: Date;
  completed_at: Date | null;
  notes: string | null;
  outcome: string | null;
  assigned_to: { id: string; name: string } | null;
  created_by: { id: string; name: string };
};

interface FollowUpSectionProps {
  entityType: "lead" | "opportunity";
  entityId: string;
  initialFollowUps: FollowUp[];
  users: { id: string; name: string }[];
  currentUserId: string;
  canManage: boolean;
  isAdmin: boolean;
}

function FuTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "Call":     return <Phone className="h-3.5 w-3.5 text-green-600 shrink-0" />;
    case "Email":    return <Mail className="h-3.5 w-3.5 text-blue-600 shrink-0" />;
    case "WhatsApp": return <MessageCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />;
    case "Visit":    return <Home className="h-3.5 w-3.5 text-orange-500 shrink-0" />;
    case "Meeting":  return <Users className="h-3.5 w-3.5 text-purple-600 shrink-0" />;
    case "Activity": return <Zap className="h-3.5 w-3.5 text-yellow-500 shrink-0" />;
    case "Internal": return <Flame className="h-3.5 w-3.5 text-red-400 shrink-0" />;
    default:         return null;
  }
}

function getRelative(date: Date): { label: string; cls: string } {
  const today = startOfDay(new Date());
  const diff = differenceInCalendarDays(startOfDay(new Date(date)), today);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, cls: "text-destructive" };
  if (diff === 0) return { label: "Today", cls: "text-orange-600" };
  if (diff === 1) return { label: "Tomorrow", cls: "text-yellow-600" };
  return { label: `in ${diff}d`, cls: "text-muted-foreground" };
}

// ── Add Follow-up Form ───────────────────────────────────────────
function AddFollowUpForm({
  entityType,
  entityId,
  users,
  currentUserId,
  activeFollowUp,
  onCreated,
  onClose,
}: {
  entityType: "lead" | "opportunity";
  entityId: string;
  users: { id: string; name: string }[];
  currentUserId: string;
  activeFollowUp: FollowUp | null;
  onCreated: (fu: FollowUp) => void;
  onClose: () => void;
}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().slice(0, 10);

  const [type, setType] = useState<string>("Call");
  const [priority, setPriority] = useState<string>("Medium");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState(currentUserId);
  const [loading, setLoading] = useState(false);

  const assigneeName = users.find((u) => u.id === assignedTo)?.name ?? "Select assignee";
  // ≥44px hit area on mobile, keeping the compact desktop density.
  const controlCls = "h-11 sm:h-8 text-xs";

  async function handleSubmit() {
    if (!date) { toast.error("Date is required"); return; }
    setLoading(true);
    try {
      const scheduled_at = `${date}T${time || "09:00"}:00`;
      const body: Record<string, unknown> = {
        type, priority, scheduled_at,
        assigned_to_id: assignedTo || undefined,
        notes: notes || undefined,
      };
      if (entityType === "lead") body.lead_id = entityId;
      else body.opportunity_id = entityId;

      const res = await fetch("/api/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error ?? "Failed"); return; }
      if (result.superseded?.scheduled_at) {
        toast.success(`Follow-up moved ${formatDate(new Date(result.superseded.scheduled_at))} → ${formatDate(new Date(scheduled_at))}`);
      } else {
        toast.success("Follow-up scheduled");
      }
      onCreated(result.data);
      onClose();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {entityType === "lead" && activeFollowUp && (
        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Current active follow-up: <span className="font-medium text-foreground">{formatDate(new Date(activeFollowUp.scheduled_at))}</span> ({activeFollowUp.type}).
          Scheduling a new date will replace it.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={(v) => v && setType(v)}>
            <SelectTrigger className={controlCls}><SelectValue>{type}</SelectValue></SelectTrigger>
            <SelectContent>
              {FOLLOW_UP_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Priority</Label>
          <Select value={priority} onValueChange={(v) => v && setPriority(v)}>
            <SelectTrigger className={controlCls}><SelectValue>{priority}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Date *</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={controlCls} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Time</Label>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={controlCls} />
        </div>
      </div>
      {users.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Assign To</Label>
          <Select value={assignedTo} onValueChange={(v) => v && setAssignedTo(v)}>
            <SelectTrigger className={controlCls}><SelectValue>{assigneeName}</SelectValue></SelectTrigger>
            <SelectContent>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs">Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" className="text-xs resize-none h-16" />
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="outline" onClick={onClose} className="flex-1 min-h-11 sm:min-h-0 sm:h-9">Cancel</Button>
        <Button onClick={handleSubmit} disabled={loading} className="flex-1 min-h-11 sm:min-h-0 sm:h-9">
          {loading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          Schedule
        </Button>
      </div>
    </div>
  );
}

// ── Main Section ─────────────────────────────────────────────────
export function FollowUpSection({
  entityType,
  entityId,
  initialFollowUps,
  users,
  currentUserId,
  canManage,
  isAdmin,
}: FollowUpSectionProps) {
  const [followUps, setFollowUps] = useState<FollowUp[]>(initialFollowUps);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addNextFor, setAddNextFor] = useState<FollowUp | null>(null);

  // "Active" is the single live follow-up; superseded/cancelled rows are history and hidden here.
  const pending = followUps
    .filter((f) => f.status === "Active")
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  const activeFollowUp = pending[0] ?? null;

  const completed = followUps
    .filter((f) => f.status === "Completed")
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime());

  async function handleMarkComplete(fu: FollowUp, andAddNext = false) {
    setCompletingId(fu.id);
    try {
      const res = await fetch(`/api/follow-ups/${fu.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed_at: new Date().toISOString() }),
      });
      if (!res.ok) { toast.error("Failed to mark complete"); return; }
      setFollowUps((prev) => prev.map((f) => f.id === fu.id ? { ...f, status: "Completed", completed_at: new Date() } : f));
      toast.success("Marked complete");
      if (andAddNext) setAddNextFor(fu);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setCompletingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/follow-ups/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Failed to delete"); return; }
      setFollowUps((prev) => prev.filter((f) => f.id !== id));
      toast.success("Deleted");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setDeletingId(null);
    }
  }

  function handleCreated(fu: FollowUp) {
    // The server superseded any previous active row — reflect that locally so only the new
    // follow-up shows as active.
    setFollowUps((prev) =>
      [
        ...prev.map((f) => (f.status === "Active" ? { ...f, status: "Superseded" } : f)),
        fu,
      ].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    );
  }

  return (
    <div className="space-y-2">
      {/* Pending follow-ups */}
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending follow-ups</p>
      ) : (
        <div className="space-y-2">
          {pending.map((fu) => {
            const scheduled = new Date(fu.scheduled_at);
            const relative = getRelative(scheduled);
            const isOverdue = scheduled < startOfDay(new Date());

            return (
              <div
                key={fu.id}
                className={cn(
                  "rounded-lg border p-2.5 space-y-1.5",
                  isOverdue
                    ? "bg-red-50/60 border-red-200 dark:bg-red-950/10"
                    : "bg-muted/20"
                )}
              >
                {/* Type + priority + date */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <FuTypeIcon type={fu.type} />
                    <span>{fu.type}</span>
                    <span className="text-muted-foreground/50">·</span>
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className={cn("text-xs", isOverdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                      {formatDate(scheduled)}
                    </span>
                    <span className={cn("text-xs", relative.cls)}>{relative.label}</span>
                  </div>
                  <PriorityBadge priority={fu.priority} />
                </div>

                {/* Assignee + notes */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {fu.assigned_to && <span>→ {fu.assigned_to.name}</span>}
                  {fu.notes && <span className="truncate">{fu.notes}</span>}
                </div>

                {/* Actions */}
                {canManage && (
                  <div className="flex gap-1.5 pt-1">
                    <button
                      onClick={() => handleMarkComplete(fu)}
                      disabled={completingId === fu.id}
                      className="flex items-center gap-1 text-xs px-3 min-h-11 sm:min-h-0 sm:px-2 sm:py-0.5 rounded bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors disabled:opacity-50"
                    >
                      {completingId === fu.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      Done
                    </button>
                    <button
                      onClick={() => handleMarkComplete(fu, true)}
                      disabled={completingId === fu.id}
                      className="flex items-center gap-1 text-xs px-3 min-h-11 sm:min-h-0 sm:px-2 sm:py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" /><Plus className="h-2.5 w-2.5" />
                      Done + Next
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(fu.id)}
                        disabled={deletingId === fu.id}
                        className="ml-auto min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 flex items-center justify-center p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        {deletingId === fu.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Completed toggle */}
      {completed.length > 0 && (
        <button
          onClick={() => setShowCompleted((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {showCompleted ? "Hide" : "Show"} {completed.length} completed
        </button>
      )}
      {showCompleted && completed.length > 0 && (
        <div className="space-y-1.5">
          {completed.map((fu) => (
            <div key={fu.id} className="rounded border bg-muted/10 p-2 flex items-center justify-between gap-2 opacity-60">
              <div className="flex items-center gap-1.5 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                <FuTypeIcon type={fu.type} />
                <span>{fu.type}</span>
                <span className="text-muted-foreground">{formatDateTime(fu.completed_at!)}</span>
                {fu.notes && <span className="truncate max-w-[120px]">{fu.notes}</span>}
              </div>
              {isAdmin && (
                <button
                  onClick={() => handleDelete(fu.id)}
                  disabled={deletingId === fu.id}
                  className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  {deletingId === fu.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add follow-up button (controlled — Sheet on mobile, Dialog on desktop) */}
      {canManage && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs min-h-11 sm:min-h-0 sm:h-8 mt-1"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Schedule Follow-up
          </Button>
          <ActionModal
            open={showAddDialog || !!addNextFor}
            onOpenChange={(o) => { setShowAddDialog(o); if (!o) setAddNextFor(null); }}
            title={addNextFor ? "Schedule Next Follow-up" : "Schedule Follow-up"}
          >
            <AddFollowUpForm
              entityType={entityType}
              entityId={entityId}
              users={users}
              currentUserId={currentUserId}
              activeFollowUp={activeFollowUp}
              onCreated={handleCreated}
              onClose={() => { setShowAddDialog(false); setAddNextFor(null); }}
            />
          </ActionModal>
        </>
      )}

      {/* Link to full follow-ups page */}
      <div className="text-right">
        <Link
          href={`/follow-ups`}
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          View all follow-ups →
        </Link>
      </div>
    </div>
  );
}
