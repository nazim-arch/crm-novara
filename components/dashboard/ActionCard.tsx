"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Phone, MessageCircle, Send, Edit3, FileText, CalendarPlus,
  CheckCircle2, X, Clock, AlertTriangle, ChevronDown, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  ACTION_TYPE_ICON, SECTION_META, TEMP_LABELS,
  type ActionItem,
} from "@/lib/command-center-types";
import {
  telUrl, whatsappUrl, whatsappMessageUrl, buildWaMessage, isValidPhone,
} from "@/lib/phone";

// ── helpers ───────────────────────────────────────────────────────────────

function fc(n: number) {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatDue(iso: string | null, overdueDays: number): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86_400_000 - 1);

  if (overdueDays > 0) return `${overdueDays}d overdue`;
  if (d <= todayEnd)
    return `Today ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}`;
  const diff = Math.ceil((d.getTime() - todayEnd.getTime()) / 86_400_000);
  return `In ${diff}d — ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

// ── Inline Note Form ──────────────────────────────────────────────────────

function NoteForm({
  leadId,
  onDone,
}: {
  leadId: string;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  async function submit() {
    const text = note.trim();
    if (!text) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        toast.success("Note saved");
        onDone();
      } else {
        toast.error("Failed to save note");
      }
    } catch {
      toast.error("Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <textarea
        ref={ref}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note…"
        rows={2}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
          if (e.key === "Escape") onDone();
        }}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={saving || !note.trim()}
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          {saving ? "Saving…" : "Save Note"}
        </button>
        <span className="text-[10px] text-muted-foreground">Ctrl+Enter to save · Esc to cancel</span>
        <button onClick={onDone} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Inline Schedule Follow-up Form ────────────────────────────────────────

const FU_TYPES = ["Call", "WhatsApp", "Email", "Visit", "Meeting", "Activity"] as const;

function ScheduleForm({
  leadId,
  onDone,
}: {
  leadId: string;
  onDone: () => void;
}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().split("T")[0];

  const [date, setDate] = useState(defaultDate);
  const [type, setType] = useState<string>("Call");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!date) return;
    setSaving(true);
    try {
      const res = await fetch("/api/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          type,
          scheduled_at: new Date(date + "T09:00:00").toISOString(),
          notes: note.trim() || undefined,
        }),
      });
      if (res.ok) {
        toast.success("Follow-up scheduled");
        onDone();
      } else {
        toast.error("Failed to schedule follow-up");
      }
    } catch {
      toast.error("Failed to schedule follow-up");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 min-w-[130px] rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="flex-1 min-w-[110px] rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {FU_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note…"
        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        onKeyDown={(e) => e.key === "Escape" && onDone()}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={saving || !date}
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          {saving ? "Scheduling…" : "Schedule"}
        </button>
        <button onClick={onDone} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Inline Update Form (temperature + activity stage) ────────────────────

const TEMP_OPTIONS = ["Hot", "Warm", "Cold", "FollowUpLater"] as const;
const ACTIVITY_STAGES = ["New","NoResponse","Busy","Unreachable","Prospect","CallBack","NotInterested","Junk"] as const;

function UpdateForm({
  leadId,
  currentTemp,
  onDone,
}: {
  leadId: string;
  currentTemp: string;
  onDone: () => void;
}) {
  const [temp, setTemp] = useState(currentTemp);
  const [stage, setStage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (temp === currentTemp && !stage) { onDone(); return; }
    setSaving(true);
    try {
      let ok = true;
      if (temp !== currentTemp) {
        const res = await fetch(`/api/leads/${leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ temperature: temp }),
        });
        if (!res.ok) ok = false;
      }
      if (stage) {
        const res = await fetch(`/api/leads/${leadId}/stage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activity_stage: stage }),
        });
        if (!res.ok) ok = false;
      }
      if (ok) { toast.success("Lead updated"); onDone(); }
      else toast.error("Update failed");
    } catch {
      toast.error("Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-[120px]">
          <p className="text-[10px] text-muted-foreground mb-1">Temperature</p>
          <select
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {TEMP_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[130px]">
          <p className="text-[10px] text-muted-foreground mb-1">Activity Stage</p>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">No change</option>
            {ACTIVITY_STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={saving}
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          {saving ? "Updating…" : "Update"}
        </button>
        <button onClick={onDone} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Main ActionCard ───────────────────────────────────────────────────────

type Panel = "note" | "schedule" | "update" | null;

export function ActionCard({
  action,
  agentName,
  onRemove,
}: {
  action: ActionItem;
  agentName: string;
  onRemove: (id: string) => void;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [completing, setCompleting] = useState(false);

  const meta = SECTION_META[action.section];
  const tempInfo = action.lead ? TEMP_LABELS[action.lead.temperature] : null;
  const dueLabel = formatDue(action.dueAt, action.overdueDays);
  const typeIcon = ACTION_TYPE_ICON[action.actionType] ?? "📋";
  const phone = action.lead?.phone ?? null;
  const valid = isValidPhone(phone);
  const callHref = valid ? telUrl(phone) : null;
  const waHref = valid ? whatsappUrl(phone) : null;
  const waMsgHref =
    valid && action.lead
      ? whatsappMessageUrl(
          phone,
          buildWaMessage({ leadName: action.lead.full_name, agentName })
        )
      : null;

  function togglePanel(p: Panel) {
    setPanel((cur) => (cur === p ? null : p));
  }

  async function markDone() {
    setCompleting(true);
    try {
      const res = await fetch(`/api/follow-ups/${action.sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error();
      toast.success("Follow-up marked as done");
      onRemove(action.id);
      router.refresh();
    } catch {
      toast.error("Failed to mark as done");
    } finally {
      setCompleting(false);
    }
  }

  const sectionBadge = (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide`}
      style={{ color: meta.color, background: `${meta.color}18` }}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </span>
  );

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 transition-all ${meta.bgClass} ${meta.borderClass}`}
    >
      {/* ── Row 1: badges + due label ────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {sectionBadge}
        <span className="text-[11px] text-muted-foreground font-medium border border-border rounded px-1.5 py-0.5">
          {typeIcon} {action.actionType}
        </span>
        {action.source === "followup" && (
          <span className="text-[11px] text-muted-foreground border border-border rounded px-1.5 py-0.5">
            Follow-up
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {action.overdueDays > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-destructive">
              <AlertTriangle className="h-3 w-3" />
              {dueLabel}
            </span>
          )}
          {action.overdueDays === 0 && dueLabel && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {dueLabel}
            </span>
          )}
        </div>
      </div>

      {/* ── Row 2: lead info ─────────────────────────────────────── */}
      {action.lead && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/leads/${action.lead.id}`}
                className="text-sm font-semibold hover:underline leading-tight"
              >
                {action.lead.full_name}
              </Link>
              {tempInfo && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${tempInfo.cls}`}>
                  {tempInfo.label}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">
                {action.lead.status}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
              <span className="font-mono">{action.lead.lead_number}</span>
              {action.opportunity && (
                <>
                  <span>·</span>
                  <Link
                    href={`/opportunities/${action.opportunity.id}`}
                    className="hover:text-primary transition-colors flex items-center gap-0.5"
                  >
                    {action.opportunity.name}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                </>
              )}
              {action.lead.phone && <span>· {action.lead.phone}</span>}
            </div>
          </div>
          {action.lead.potential_lead_value && (
            <span className="text-xs font-semibold text-primary whitespace-nowrap shrink-0">
              {fc(action.lead.potential_lead_value)}
            </span>
          )}
        </div>
      )}

      {/* ── Row 3: reason + context ───────────────────────────────── */}
      <div className="space-y-0.5">
        <p className="text-[11px] font-medium text-muted-foreground">{action.reason}</p>
        {action.context && (
          <p className="text-xs text-foreground/80 line-clamp-2 italic">
            &ldquo;{action.context}&rdquo;
          </p>
        )}
      </div>

      {/* ── Row 4: quick action buttons ───────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Call */}
        {callHref ? (
          <a
            href={callHref}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/40 text-xs font-medium hover:bg-green-100 transition-colors"
          >
            <Phone className="h-3 w-3" /> Call
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs opacity-40 cursor-not-allowed border border-border">
            <Phone className="h-3 w-3" /> Call
          </span>
        )}

        {/* WhatsApp */}
        {waHref ? (
          <a
            href={waMsgHref ?? waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-900/40 text-xs font-medium hover:bg-green-100 transition-colors"
          >
            <MessageCircle className="h-3 w-3" /> WA
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs opacity-40 cursor-not-allowed border border-border">
            <MessageCircle className="h-3 w-3" /> WA
          </span>
        )}

        {/* Update (lead only) */}
        {action.lead && (
          <button
            onClick={() => togglePanel("update")}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              panel === "update"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-muted"
            }`}
          >
            <Edit3 className="h-3 w-3" />
            Update
            <ChevronDown className={`h-3 w-3 transition-transform ${panel === "update" ? "rotate-180" : ""}`} />
          </button>
        )}

        {/* Note (lead only) */}
        {action.lead && (
          <button
            onClick={() => togglePanel("note")}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              panel === "note"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-muted"
            }`}
          >
            <FileText className="h-3 w-3" />
            Note
            <ChevronDown className={`h-3 w-3 transition-transform ${panel === "note" ? "rotate-180" : ""}`} />
          </button>
        )}

        {/* Schedule (lead only) */}
        {action.lead && (
          <button
            onClick={() => togglePanel("schedule")}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              panel === "schedule"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-muted"
            }`}
          >
            <CalendarPlus className="h-3 w-3" />
            Schedule
            <ChevronDown className={`h-3 w-3 transition-transform ${panel === "schedule" ? "rotate-180" : ""}`} />
          </button>
        )}

        {/* Mark Done (follow-ups only) */}
        {action.source === "followup" && (
          <button
            onClick={markDone}
            disabled={completing}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40 text-xs font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50 ml-auto"
          >
            <CheckCircle2 className="h-3 w-3" />
            {completing ? "…" : "Done"}
          </button>
        )}

        {/* Open lead */}
        {action.lead && (
          <Link
            href={`/leads/${action.lead.id}`}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ${action.source === "lead" ? "ml-auto" : ""}`}
          >
            <ExternalLink className="h-3 w-3" />
            Open
          </Link>
        )}
      </div>

      {/* ── Inline panels ────────────────────────────────────────── */}
      {panel === "note" && action.lead && (
        <div className="border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Add Note</p>
          <NoteForm
            leadId={action.lead.id}
            onDone={() => { setPanel(null); router.refresh(); }}
          />
        </div>
      )}

      {panel === "schedule" && action.lead && (
        <div className="border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Schedule Follow-up</p>
          <ScheduleForm
            leadId={action.lead.id}
            onDone={() => { setPanel(null); router.refresh(); }}
          />
        </div>
      )}

      {panel === "update" && action.lead && (
        <div className="border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Update Lead</p>
          <UpdateForm
            leadId={action.lead.id}
            currentTemp={action.lead.temperature}
            onDone={() => { setPanel(null); router.refresh(); }}
          />
        </div>
      )}
    </div>
  );
}
