"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Phone, MessageCircle, Mail, CheckCircle, XCircle, RotateCcw, Calendar,
  ChevronLeft, ChevronRight, ExternalLink, Loader2, User, MapPin, Home,
  TrendingUp, Tag, Clock, AlertTriangle, Flame, Target, Zap,
  CheckCircle2, PhoneOff, Coffee, BadgeCheck, List,
} from "lucide-react";
import { getFollowUpCardTheme, getDueLabel } from "./focus-queue-theme";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FocusLead {
  id: string; lead_number: string; full_name: string;
  phone: string; email: string | null; whatsapp: string | null;
  temperature: string; status: string; activity_stage: string;
  potential_lead_value: number | null;
  budget_min: number | null; budget_max: number | null;
  property_type: string | null; location_preference: string | null;
  purpose: string | null; lead_source: string;
  last_contact_date: string | null; next_followup_date: string | null;
  followup_type: string | null; outcome: string | null; deleted_at: string | null;
  assigned_to: { id: string; name: string };
}

interface FocusItem {
  id: string; type: string; priority: string;
  scheduled_at: string; callback_at: string | null; completed_at: string | null;
  notes: string | null; outcome: string | null;
  attempt_count: number; no_response_count: number;
  lead_id: string | null; opportunity_id: string | null;
  lead: FocusLead | null;
  opportunity: { id: string; opp_number: string; name: string } | null;
  assigned_to: { id: string; name: string } | null;
  created_by: { id: string; name: string };
}

interface Stats { overdue: number; due_today: number; callback_today: number; completed_today: number; hot_active: number; }
interface QueueData { queue: FocusItem[]; callback_pending: FocusItem[]; completed_today: FocusItem[]; stats: Stats; }

type ModalType =
  | "contacted" | "no_response" | "callback_today"
  | "schedule_next" | "update_stage" | "mark_lost"
  | "mark_won" | "site_visit_done" | "update_notes"
  | "log_attempt"
  | null;

interface ModalState { type: ModalType; item: FocusItem; }

const FOLLOW_UP_TYPES = ["Call", "Email", "WhatsApp", "Visit", "Meeting", "Activity", "Internal"] as const;
const PIPELINE_STAGES = ["New", "Prospect", "SiteVisitCompleted", "Negotiation", "Won", "Lost", "InvalidLead", "OnHold", "Recycle"] as const;
const TEMPERATURES = ["Hot", "Warm", "Cold", "FollowUpLater"] as const;
const LOST_REASONS = ["Budget", "Location", "Configuration", "Timing", "NotSerious", "Financing", "PurchasedElsewhere", "Other"] as const;
const OUTCOMES = ["Contacted", "Interested", "Not Interested", "Site Visit Scheduled", "Negotiation Started", "Call Back Requested", "Wrong Number", "Language Barrier", "Busy"] as const;
const CALLBACK_QUICK = [
  { label: "+30 min", mins: 30 }, { label: "+1 hour", mins: 60 },
  { label: "+2 hours", mins: 120 }, { label: "End of day", mins: -1 },
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function inrFmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function StatCard({ label, value, cls }: { label: string; value: number; cls?: string }) {
  return (
    <Card className="p-0">
      <CardContent className="py-2 px-3">
        <p className={`text-xl font-bold ${cls ?? ""}`}>{value}</p>
        <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
      </CardContent>
    </Card>
  );
}

function TempBadge({ temp }: { temp: string }) {
  const map: Record<string, string> = {
    Hot: "bg-red-100 text-red-700",
    Warm: "bg-amber-100 text-amber-700",
    Cold: "bg-blue-100 text-blue-700",
    FollowUpLater: "bg-purple-100 text-purple-700",
  };
  const labels: Record<string, string> = { FollowUpLater: "Follow Up Later" };
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${map[temp] ?? "bg-muted text-muted-foreground"}`}>{labels[temp] ?? temp}</span>;
}

function StageBadge({ stage }: { stage: string }) {
  const map: Record<string, string> = {
    New: "bg-slate-100 text-slate-700", Prospect: "bg-blue-100 text-blue-700",
    SiteVisitCompleted: "bg-indigo-100 text-indigo-700", Negotiation: "bg-orange-100 text-orange-700",
    Won: "bg-emerald-100 text-emerald-700", Lost: "bg-red-100 text-red-700",
    InvalidLead: "bg-gray-100 text-gray-500", OnHold: "bg-yellow-100 text-yellow-700",
    Recycle: "bg-purple-100 text-purple-700",
  };
  return <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${map[stage] ?? "bg-muted text-muted-foreground"}`}>{stage}</span>;
}

// ── Focus Card ────────────────────────────────────────────────────────────────

function FocusCard({
  item, onAction, onLogAttempt, idx, total,
}: {
  item: FocusItem;
  onAction: (type: ModalType) => void;
  onLogAttempt: (channel: "Call" | "WhatsApp" | "Email") => void;
  idx: number;
  total: number;
}) {
  const lead = item.lead;
  const isOverdue = !item.callback_at && new Date(item.scheduled_at) < new Date();
  const daysOverdue = isOverdue
    ? Math.max(0, differenceInCalendarDays(new Date(), new Date(item.scheduled_at)))
    : 0;
  const theme = getFollowUpCardTheme(
    lead?.temperature, isOverdue, daysOverdue,
    item.no_response_count, lead?.potential_lead_value ?? null,
    !!item.callback_at,
  );
  const due = getDueLabel(item.scheduled_at, item.callback_at);

  const whatsappNum = lead?.whatsapp ?? lead?.phone ?? "";
  const waLink = `https://wa.me/${whatsappNum.replace(/\D/g, "")}`;

  return (
    <div className={`rounded-2xl border-2 ${theme.border} ${theme.card} overflow-hidden shadow-md`}>
      {/* Temperature strip */}
      <div className={`h-1.5 ${theme.strip}`} />

      <div className="p-4 sm:p-5 space-y-4">
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center flex-wrap gap-1.5 mb-1">
              <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-sm ${theme.badgeBg} ${theme.badgeText}`}>
                {theme.priorityLabel}
              </span>
              {due.isUrgent && <span className="flex items-center gap-0.5 text-[10px] font-bold text-destructive"><AlertTriangle className="h-3 w-3" />URGENT</span>}
            </div>
            <h2 className="text-xl font-bold leading-tight">
              {lead?.full_name ?? "Unknown Lead"}
            </h2>
            <p className="text-xs text-muted-foreground font-mono">{lead?.lead_number}</p>
            <p className="text-xs text-muted-foreground italic mt-0.5">{theme.headline}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-muted-foreground">{idx + 1}/{total}</p>
            <div className="flex flex-col items-end gap-1 mt-1">
              {lead && <TempBadge temp={lead.temperature} />}
              {lead && <StageBadge stage={lead.status} />}
            </div>
          </div>
        </div>

        {/* Urgency badges */}
        {theme.urgencyBadges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {theme.urgencyBadges.map((b) => (
              <span key={b.text} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${b.cls}`}>{b.text}</span>
            ))}
          </div>
        )}

        {/* ── Due Time Section ── */}
        <div className={`rounded-xl border px-3 py-2.5 flex items-center gap-3 ${due.isUrgent ? "bg-destructive/5 border-destructive/20" : "bg-background/70 border-border/50"}`}>
          <Clock className={`h-4 w-4 shrink-0 ${due.isUrgent ? "text-destructive" : "text-muted-foreground"}`} />
          <div>
            <p className={`text-sm font-semibold ${due.cls}`}>{due.label}</p>
            <p className="text-[11px] text-muted-foreground">
              {item.callback_at ? "Callback" : "Scheduled"}: {new Date(item.callback_at ?? item.scheduled_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              {item.attempt_count > 0 && ` · ${item.attempt_count} attempt${item.attempt_count > 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {/* ── Contact Buttons ── */}
        <div className="flex gap-2">
          <a
            href={`tel:${lead?.phone ?? ""}`}
            onClick={() => onLogAttempt("Call")}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors"
          >
            <Phone className="h-4 w-4" />
            {lead?.phone ?? "Call"}
          </a>
          {(lead?.whatsapp ?? lead?.phone) && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onLogAttempt("WhatsApp")}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          )}
          {lead?.email && (
            <a
              href={`mailto:${lead.email}`}
              onClick={() => onLogAttempt("Email")}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted text-sm transition-colors"
            >
              <Mail className="h-4 w-4" />
            </a>
          )}
        </div>

        {/* ── Lead Context ── */}
        {lead && (
          <div className="rounded-xl bg-background/70 border border-border/60 p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Lead Context</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {(lead.budget_min || lead.budget_max) && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <TrendingUp className="h-3 w-3 shrink-0" />
                  <span>{lead.budget_min && lead.budget_max ? `${inrFmt(lead.budget_min)} – ${inrFmt(lead.budget_max)}` : inrFmt((lead.budget_min ?? lead.budget_max)!)}</span>
                </div>
              )}
              {lead.location_preference && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{lead.location_preference}</span>
                </div>
              )}
              {lead.property_type && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Home className="h-3 w-3 shrink-0" />
                  <span>{lead.property_type}</span>
                </div>
              )}
              {lead.purpose && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Target className="h-3 w-3 shrink-0" />
                  <span>{lead.purpose}</span>
                </div>
              )}
              {lead.potential_lead_value && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Zap className="h-3 w-3 shrink-0" />
                  <span className="font-medium text-foreground">{inrFmt(lead.potential_lead_value)}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Tag className="h-3 w-3 shrink-0" />
                <span>{lead.lead_source}</span>
              </div>
              {item.opportunity && (
                <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
                  <Target className="h-3 w-3 shrink-0" />
                  <span className="font-medium text-foreground">{item.opportunity.name}</span>
                  <span className="font-mono text-[10px]">{item.opportunity.opp_number}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Last Interaction ── */}
        {(lead?.outcome || lead?.last_contact_date || item.notes) && (
          <div className="rounded-xl bg-background/70 border border-border/60 p-3 space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Last Interaction</p>
            {lead?.last_contact_date && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(lead.last_contact_date).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            {(lead?.outcome || item.notes) && (
              <p className="text-xs text-foreground leading-relaxed line-clamp-3">
                {item.notes ?? lead?.outcome}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Assigned to <span className="font-medium">{lead?.assigned_to?.name ?? item.assigned_to?.name ?? "—"}</span>
            </p>
          </div>
        )}

        {/* ── Action Buttons ── */}
        <div className="space-y-2 pt-1 border-t">
          {/* Primary outcomes */}
          <div className="grid grid-cols-3 gap-1.5">
            <Button size="sm" variant="outline" className="gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-xs h-9" onClick={() => onAction("contacted")}>
              <CheckCircle className="h-3.5 w-3.5" />Contacted
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-orange-700 border-orange-200 hover:bg-orange-50 text-xs h-9" onClick={() => onAction("no_response")}>
              <PhoneOff className="h-3.5 w-3.5" />No Response
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-violet-700 border-violet-200 hover:bg-violet-50 text-xs h-9" onClick={() => onAction("callback_today")}>
              <Coffee className="h-3.5 w-3.5" />Callback
            </Button>
          </div>
          {/* Secondary actions */}
          <div className="grid grid-cols-3 gap-1.5">
            <Button size="sm" variant="outline" className="gap-1 text-blue-700 border-blue-200 hover:bg-blue-50 text-xs h-9" onClick={() => onAction("schedule_next")}>
              <Calendar className="h-3.5 w-3.5" />Schedule Next
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-indigo-700 border-indigo-200 hover:bg-indigo-50 text-xs h-9" onClick={() => onAction("update_stage")}>
              <Zap className="h-3.5 w-3.5" />Update Stage
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-purple-700 border-purple-200 hover:bg-purple-50 text-xs h-9" onClick={() => onAction("site_visit_done")}>
              <BadgeCheck className="h-3.5 w-3.5" />Site Visit Done
            </Button>
          </div>
          {/* Terminal actions */}
          <div className="grid grid-cols-3 gap-1.5">
            <Button size="sm" variant="outline" className="gap-1 text-muted-foreground text-xs h-9" onClick={() => onAction("update_notes")}>
              Update Notes
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10 text-xs h-9" onClick={() => onAction("mark_lost")}>
              <XCircle className="h-3.5 w-3.5" />Mark Lost
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-xs h-9 font-semibold" onClick={() => onAction("mark_won")}>
              <Flame className="h-3.5 w-3.5" />Mark Won
            </Button>
          </div>
          {/* Open lead */}
          {lead && (
            <Link href={`/leads/${lead.id}`} target="_blank" className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1 transition-colors">
              <ExternalLink className="h-3 w-3" />Open Full Lead
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Completed Row ─────────────────────────────────────────────────────────────

function CompletedRow({ item }: { item: FocusItem }) {
  const lead = item.lead;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-0">
      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/leads/${lead?.id}`} className="font-medium text-sm hover:underline">{lead?.full_name ?? "—"}</Link>
          <span className="text-[11px] font-mono text-muted-foreground">{lead?.lead_number}</span>
          {lead && <TempBadge temp={lead.temperature} />}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {item.outcome ?? "Completed"} · {item.type}
          {item.completed_at && ` · ${new Date(item.completed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`}
        </p>
        {item.notes && <p className="text-xs text-muted-foreground italic mt-0.5 line-clamp-1">"{item.notes}"</p>}
      </div>
    </div>
  );
}

// ── Callback Row ──────────────────────────────────────────────────────────────

function CallbackRow({ item }: { item: FocusItem }) {
  const lead = item.lead;
  const due = getDueLabel(item.scheduled_at, item.callback_at);
  const isPast = item.callback_at && new Date(item.callback_at) <= new Date();
  return (
    <div className={`flex items-start gap-3 py-2.5 border-b last:border-0 ${isPast ? "bg-violet-50/40 dark:bg-violet-950/10 -mx-3 px-3 rounded" : ""}`}>
      <RotateCcw className={`h-4 w-4 shrink-0 mt-0.5 ${isPast ? "text-violet-600" : "text-muted-foreground"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/leads/${lead?.id}`} className="font-medium text-sm hover:underline">{lead?.full_name ?? "—"}</Link>
          {lead && <TempBadge temp={lead.temperature} />}
          {isPast && <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">DUE NOW</span>}
        </div>
        <p className={`text-xs mt-0.5 ${due.cls}`}>{due.label}</p>
        {item.notes && <p className="text-xs text-muted-foreground italic line-clamp-1">"{item.notes}"</p>}
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function getModalTitle(type: ModalType): string {
  switch (type) {
    case "contacted": return "Mark as Contacted";
    case "no_response": return "No Response";
    case "callback_today": return "Callback Again Today";
    case "schedule_next": return "Schedule Next Follow-up";
    case "update_stage": return "Update Pipeline Stage";
    case "mark_lost": return "Mark as Lost";
    case "mark_won": return "Mark as Won";
    case "site_visit_done": return "Site Visit Done";
    case "update_notes": return "Update Notes";
    default: return "Action";
  }
}

function quickCallbackTime(mins: number): string {
  if (mins === -1) {
    const eod = new Date(); eod.setHours(18, 0, 0, 0);
    return eod.toISOString().slice(0, 16);
  }
  return new Date(Date.now() + mins * 60_000).toISOString().slice(0, 16);
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SalesFocusQueue({
  isAdmin, isManagerOrAdmin, users, currentUserId, role,
}: {
  isAdmin: boolean;
  isManagerOrAdmin: boolean;
  users: { id: string; name: string }[];
  currentUserId: string;
  role: string;
}) {
  const [data, setData] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cardIdx, setCardIdx] = useState(0);
  const [agentFilter, setAgentFilter] = useState<string>(isManagerOrAdmin ? "mine" : currentUserId);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [subAction, setSubAction] = useState<"callback_today" | "schedule_next" | "mark_unreachable">("callback_today");

  const modalRef = useRef(modal);
  modalRef.current = modal;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (isManagerOrAdmin) {
      params.set("agent", agentFilter);
    }
    const res = await fetch(`/api/follow-ups/focus-queue?${params}`);
    if (res.ok) {
      const json: QueueData = await res.json();
      setData(json);
      setCardIdx(0);
    }
    setLoading(false);
  }, [agentFilter, isManagerOrAdmin]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (modalRef.current) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === "n") setCardIdx((i) => Math.min(i + 1, (data?.queue.length ?? 1) - 1));
      if (e.key === "ArrowLeft" || e.key === "p") setCardIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [data?.queue.length]);

  function openModal(type: ModalType) {
    const item = data?.queue[cardIdx];
    if (!item) return;
    setForm({});
    setSubAction("callback_today");
    setModal({ type, item });
  }

  async function logAttempt(channel: "Call" | "WhatsApp" | "Email") {
    const item = data?.queue[cardIdx];
    if (!item) return;
    await fetch(`/api/follow-ups/${item.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "log_attempt", channel }),
    });
    // Update attempt_count in place
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        queue: prev.queue.map((q) =>
          q.id === item.id ? { ...q, attempt_count: q.attempt_count + 1 } : q
        ),
      };
    });
    toast.info(`${channel} attempt logged`);
  }

  async function submitModal() {
    if (!modal) return;
    const { type, item } = modal;

    // Validation
    if (type === "contacted" && !form.outcome) { toast.error("Select an outcome"); return; }
    if (type === "no_response" && !form.notes?.trim()) { toast.error("Notes are required"); return; }
    if ((type === "update_stage" || type === "mark_lost" || type === "mark_won" || type === "site_visit_done" || type === "update_notes") && !form.notes?.trim()) {
      toast.error("Notes are required"); return;
    }
    if (type === "mark_lost" && !form.lost_reason) { toast.error("Select a lost reason"); return; }
    if (type === "callback_today" && !form.callback_time) { toast.error("Select callback time"); return; }
    if (type === "schedule_next" && (!form.next_date || !form.next_type)) { toast.error("Date and type are required"); return; }
    if (type === "update_stage" && !form.to_stage) { toast.error("Select a stage"); return; }
    if (type === "no_response" && subAction === "callback_today" && !form.callback_time) { toast.error("Select callback time"); return; }

    // Build payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let payload: Record<string, any> = { action: type };

    if (type === "contacted") {
      payload = {
        action: "contacted",
        outcome: form.outcome,
        notes: form.notes || undefined,
        temperature: form.temperature || undefined,
        to_stage: form.to_stage || undefined,
        next_followup_date: form.next_date ? (form.next_time ? form.next_date + "T" + form.next_time : form.next_date + "T09:00:00") : undefined,
        next_followup_type: form.next_type || undefined,
      };
    } else if (type === "no_response") {
      payload = {
        action: "no_response",
        notes: form.notes,
        sub_action: subAction,
        callback_time: form.callback_time || undefined,
        next_followup_date: form.next_date ? form.next_date + "T09:00:00" : undefined,
        next_followup_type: form.next_type || undefined,
      };
    } else if (type === "callback_today") {
      payload = { action: "callback_today", callback_time: form.callback_time, notes: form.notes || undefined };
    } else if (type === "schedule_next") {
      payload = {
        action: "schedule_next",
        next_date: form.next_date,
        next_time: form.next_time || undefined,
        next_type: form.next_type,
        notes: form.notes || undefined,
      };
    } else if (type === "update_stage") {
      payload = { action: "update_stage", to_stage: form.to_stage, notes: form.notes };
    } else if (type === "mark_lost") {
      payload = { action: "mark_lost", lost_reason: form.lost_reason, notes: form.notes, lost_notes: form.notes };
    } else if (type === "mark_won") {
      payload = {
        action: "mark_won",
        notes: form.notes,
        settlement_value: form.settlement_value ? Number(form.settlement_value) : undefined,
        deal_commission_percent: form.commission_pct ? Number(form.commission_pct) : undefined,
      };
    } else if (type === "site_visit_done") {
      payload = {
        action: "site_visit_done",
        notes: form.notes,
        next_followup_date: form.next_date ? form.next_date + "T09:00:00" : undefined,
        next_followup_type: form.next_type || undefined,
      };
    } else if (type === "update_notes") {
      payload = { action: "update_notes", notes: form.notes };
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/follow-ups/${item.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Action failed");
        return;
      }
      const result = await res.json();
      const resultAction = result.action as string;

      setModal(null);

      if (resultAction === "callback_today") {
        // Move card to callback list
        setData((prev) => {
          if (!prev) return prev;
          const updated = prev.queue.map((q) => q.id === item.id ? { ...q, callback_at: result.data.callback_at } : q);
          const stillInQueue = updated.filter((q) => q.id !== item.id || !q.callback_at || new Date(q.callback_at) > new Date());
          const callbackItem = updated.find((q) => q.id === item.id);
          return {
            ...prev,
            queue: stillInQueue,
            callback_pending: callbackItem
              ? [...prev.callback_pending, callbackItem].sort((a, b) => new Date(a.callback_at!).getTime() - new Date(b.callback_at!).getTime())
              : prev.callback_pending,
          };
        });
        setCardIdx((i) => Math.max(0, Math.min(i, (data?.queue.length ?? 2) - 2)));
        toast.success("Parked for callback today");
      } else if (resultAction === "notes_updated") {
        setData((prev) => {
          if (!prev) return prev;
          return { ...prev, queue: prev.queue.map((q) => q.id === item.id ? { ...q, notes: result.data.notes } : q) };
        });
        toast.success("Notes updated");
      } else {
        // Remove from queue (completed / stage updated / etc.)
        setData((prev) => {
          if (!prev) return prev;
          const removedItem = prev.queue.find((q) => q.id === item.id);
          const newQueue = prev.queue.filter((q) => q.id !== item.id);
          const newCompleted = removedItem && result.data.completed_at
            ? [{ ...removedItem, completed_at: result.data.completed_at, outcome: result.data.outcome }, ...prev.completed_today]
            : prev.completed_today;
          return {
            ...prev,
            queue: newQueue,
            completed_today: newCompleted,
            stats: { ...prev.stats, completed_today: prev.stats.completed_today + (result.data.completed_at ? 1 : 0) },
          };
        });
        setCardIdx((i) => Math.max(0, Math.min(i, (data?.queue.length ?? 2) - 2)));
        toast.success("Done");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const f = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));
  const stats = data?.stats;
  const queue = data?.queue ?? [];
  const currentItem = queue[cardIdx];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 mt-2">
      {/* Agent Selector — Admin/Manager only */}
      {isManagerOrAdmin && (
        <div className="flex items-center gap-2">
          <Select value={agentFilter} onValueChange={(v) => { if (v) setAgentFilter(v); }}>
            <SelectTrigger className="h-8 text-xs w-48">
              <User className="h-3 w-3 mr-1" />
              <SelectValue>
                {agentFilter === "mine" ? "My Follow-ups" : agentFilter === "team" ? "Team Follow-ups" : users.find((u) => u.id === agentFilter)?.name ?? "Agent"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mine">My Follow-ups</SelectItem>
              {isAdmin && <SelectItem value="team">Team Follow-ups</SelectItem>}
              <SelectItem value="" disabled className="text-muted-foreground text-xs py-1">── Specific Agent ──</SelectItem>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {role === "Admin" || role === "Manager" ? `Viewing: ${agentFilter === "team" ? "all agents" : agentFilter === "mine" ? "your follow-ups" : users.find((u) => u.id === agentFilter)?.name}` : ""}
          </p>
        </div>
      )}

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          <StatCard label="Overdue" value={stats.overdue} cls="text-destructive" />
          <StatCard label="Due Today" value={stats.due_today} cls="text-orange-600" />
          <StatCard label="Callback Today" value={stats.callback_today} cls="text-violet-600" />
          <StatCard label="Completed Today" value={stats.completed_today} cls="text-emerald-600" />
          <StatCard label="Hot Active" value={stats.hot_active} cls="text-red-600" />
        </div>
      )}

      {/* Inner Tabs */}
      <Tabs defaultValue="focus">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="focus" className="gap-1 text-xs sm:text-sm">
            <Zap className="h-3.5 w-3.5" />Focus Queue
            {queue.length > 0 && <span className="ml-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 leading-5">{queue.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="callback" className="gap-1 text-xs sm:text-sm">
            <RotateCcw className="h-3.5 w-3.5" />Callback Today
            {(data?.callback_pending.length ?? 0) > 0 && <span className="text-[10px] opacity-70 ml-0.5">({data?.callback_pending.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-1 text-xs sm:text-sm">
            <CheckCircle2 className="h-3.5 w-3.5" />Completed Today
            {(data?.completed_today.length ?? 0) > 0 && <span className="text-[10px] opacity-70 ml-0.5">({data?.completed_today.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-1 text-xs sm:text-sm">
            <List className="h-3.5 w-3.5" />All
          </TabsTrigger>
        </TabsList>

        {/* ── Focus Queue ── */}
        <TabsContent value="focus" className="mt-3">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle className="h-12 w-12 text-emerald-400 mb-3" />
              <p className="text-lg font-semibold">You are caught up.</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">No overdue or due follow-ups right now. New cards will appear when follow-ups become due.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={fetchData}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Refresh
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Navigation */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={cardIdx === 0} onClick={() => setCardIdx((i) => Math.max(0, i - 1))}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground">{cardIdx + 1} of {queue.length}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={cardIdx >= queue.length - 1} onClick={() => setCardIdx((i) => Math.min(queue.length - 1, i + 1))}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={fetchData}>
                    <RotateCcw className="h-3 w-3 mr-1" />Refresh
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground hidden sm:block">← → navigate</p>
              </div>

              {/* Card */}
              {currentItem && (
                <div className="max-w-xl mx-auto">
                  <FocusCard item={currentItem} idx={cardIdx} total={queue.length} onAction={openModal} onLogAttempt={logAttempt} />
                </div>
              )}

              {/* Queue preview list */}
              {queue.length > 1 && (
                <div className="max-w-xl mx-auto mt-3 rounded-lg border divide-y max-h-48 overflow-y-auto text-xs">
                  {queue.map((item, i) => {
                    const isOverdue = !item.callback_at && new Date(item.scheduled_at) < new Date();
                    return (
                      <button key={item.id} onClick={() => setCardIdx(i)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors ${i === cardIdx ? "bg-muted/50 font-medium" : ""}`}>
                        <div className={`w-2 h-2 rounded-full shrink-0 ${item.lead?.temperature === "Hot" ? "bg-red-500" : item.lead?.temperature === "Warm" ? "bg-amber-400" : "bg-blue-400"}`} />
                        <span className="truncate flex-1">{item.lead?.full_name ?? "—"}</span>
                        {isOverdue && <span className="text-destructive text-[10px] shrink-0">OVERDUE</span>}
                        {item.callback_at && <span className="text-violet-600 text-[10px] shrink-0">CALLBACK</span>}
                        <span className="text-muted-foreground shrink-0">{item.type}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Callback Today ── */}
        <TabsContent value="callback" className="mt-3">
          {(data?.callback_pending.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Coffee className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="font-medium">No callbacks parked for today.</p>
              <p className="text-sm text-muted-foreground mt-1">Leads marked for callback again today will appear here.</p>
            </div>
          ) : (
            <div className="rounded-lg border bg-card p-3 divide-y">
              {data?.callback_pending.map((item) => <CallbackRow key={item.id} item={item} />)}
            </div>
          )}
        </TabsContent>

        {/* ── Completed Today ── */}
        <TabsContent value="completed" className="mt-3">
          {(data?.completed_today.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="font-medium">No follow-ups completed today yet.</p>
              <p className="text-sm text-muted-foreground mt-1">Completed follow-ups will appear here after you action them.</p>
            </div>
          ) : (
            <div className="rounded-lg border bg-card p-3 divide-y">
              {data?.completed_today.map((item) => <CompletedRow key={item.id} item={item} />)}
            </div>
          )}
        </TabsContent>

        {/* ── All Follow-ups ── */}
        <TabsContent value="all" className="mt-3">
          <div className="rounded-lg border bg-card divide-y max-h-96 overflow-y-auto text-sm">
            {[...(data?.queue ?? []), ...(data?.callback_pending ?? [])].length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">No active follow-ups</p>
            ) : (
              [...(data?.queue ?? []), ...(data?.callback_pending ?? [])].map((item) => {
                const isOverdue = !item.callback_at && new Date(item.scheduled_at) < new Date();
                return (
                  <div key={item.id} className={`flex items-center gap-3 px-3 py-2.5 ${isOverdue ? "bg-red-50/40 dark:bg-red-950/10" : ""}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${item.lead?.temperature === "Hot" ? "bg-red-500" : item.lead?.temperature === "Warm" ? "bg-amber-400" : "bg-blue-400"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Link href={`/leads/${item.lead?.id}`} className="font-medium hover:underline text-sm">{item.lead?.full_name ?? "—"}</Link>
                        {item.lead && <TempBadge temp={item.lead.temperature} />}
                        {isOverdue && <span className="text-[10px] text-destructive font-bold">OVERDUE</span>}
                        {item.callback_at && <span className="text-[10px] text-violet-600 font-medium">CALLBACK</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{item.type} · {new Date(item.callback_at ?? item.scheduled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">{item.assigned_to?.name}</div>
                  </div>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Action Modals ──────────────────────────────────────────────────── */}
      <Dialog open={!!modal} onOpenChange={(o) => { if (!o) setModal(null); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{getModalTitle(modal?.type ?? null)}</DialogTitle>
          </DialogHeader>

          {modal && (
            <div className="space-y-3 pt-1">
              {modal.item.lead && (
                <p className="text-sm text-muted-foreground">
                  Lead: <span className="font-medium text-foreground">{modal.item.lead.full_name} ({modal.item.lead.lead_number})</span>
                </p>
              )}

              {/* ── Contacted ── */}
              {modal.type === "contacted" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Outcome *</Label>
                    <Select value={form.outcome ?? ""} onValueChange={(v) => v && f("outcome", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select outcome" /></SelectTrigger>
                      <SelectContent>
                        {OUTCOMES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Notes</Label>
                    <Textarea value={form.notes ?? ""} onChange={(e) => f("notes", e.target.value)} placeholder="What was discussed…" className="text-xs resize-none h-16" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Update Temperature</Label>
                      <Select value={form.temperature ?? ""} onValueChange={(v) => v && f("temperature", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="No change" /></SelectTrigger>
                        <SelectContent>
                          {TEMPERATURES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Update Stage</Label>
                      <Select value={form.to_stage ?? ""} onValueChange={(v) => v && f("to_stage", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="No change" /></SelectTrigger>
                        <SelectContent>
                          {PIPELINE_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Schedule Next Follow-up (optional)</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Input type="date" value={form.next_date ?? ""} onChange={(e) => f("next_date", e.target.value)} className="h-8 text-xs col-span-1" />
                      <Input type="time" value={form.next_time ?? ""} onChange={(e) => f("next_time", e.target.value)} className="h-8 text-xs col-span-1" />
                      <Select value={form.next_type ?? ""} onValueChange={(v) => v && f("next_type", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                        <SelectContent>
                          {FOLLOW_UP_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {/* ── No Response ── */}
              {modal.type === "no_response" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Notes *</Label>
                    <Textarea value={form.notes ?? ""} onChange={(e) => f("notes", e.target.value)} placeholder="Attempted call, no answer…" className="text-xs resize-none h-14" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Next Action *</Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(["callback_today", "schedule_next", "mark_unreachable"] as const).map((sa) => (
                        <button key={sa} type="button" onClick={() => setSubAction(sa)}
                          className={`px-2 py-1.5 rounded border text-xs font-medium transition-colors ${subAction === sa ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>
                          {sa === "callback_today" ? "Callback Today" : sa === "schedule_next" ? "Schedule Next" : "Not Reachable"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {subAction === "callback_today" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Callback Time</Label>
                      <div className="flex gap-1.5 flex-wrap">
                        {CALLBACK_QUICK.map((q) => (
                          <button key={q.label} type="button"
                            onClick={() => f("callback_time", quickCallbackTime(q.mins))}
                            className={`px-2 py-1 rounded border text-xs transition-colors ${form.callback_time === quickCallbackTime(q.mins) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>
                            {q.label}
                          </button>
                        ))}
                      </div>
                      <Input type="datetime-local" value={form.callback_time ?? ""} onChange={(e) => f("callback_time", e.target.value)} className="h-8 text-xs" />
                    </div>
                  )}
                  {subAction === "schedule_next" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Next Date</Label>
                        <Input type="date" value={form.next_date ?? ""} onChange={(e) => f("next_date", e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Type</Label>
                        <Select value={form.next_type ?? ""} onValueChange={(v) => v && f("next_type", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                          <SelectContent>
                            {FOLLOW_UP_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── Callback Today ── */}
              {modal.type === "callback_today" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Callback Time *</Label>
                    <div className="flex gap-1.5 flex-wrap">
                      {CALLBACK_QUICK.map((q) => (
                        <button key={q.label} type="button"
                          onClick={() => f("callback_time", quickCallbackTime(q.mins))}
                          className={`px-2 py-1 rounded border text-xs transition-colors ${form.callback_time === quickCallbackTime(q.mins) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>
                          {q.label}
                        </button>
                      ))}
                    </div>
                    <Input type="datetime-local" value={form.callback_time ?? ""} onChange={(e) => f("callback_time", e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Notes (optional)</Label>
                    <Textarea value={form.notes ?? ""} onChange={(e) => f("notes", e.target.value)} placeholder="Reason for callback…" className="text-xs resize-none h-14" />
                  </div>
                </>
              )}

              {/* ── Schedule Next ── */}
              {modal.type === "schedule_next" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Date *</Label>
                      <Input type="date" value={form.next_date ?? ""} onChange={(e) => f("next_date", e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Time</Label>
                      <Input type="time" value={form.next_time ?? ""} onChange={(e) => f("next_time", e.target.value)} className="h-8 text-xs" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Type *</Label>
                    <Select value={form.next_type ?? ""} onValueChange={(v) => v && f("next_type", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Follow-up type" /></SelectTrigger>
                      <SelectContent>
                        {FOLLOW_UP_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Notes</Label>
                    <Textarea value={form.notes ?? ""} onChange={(e) => f("notes", e.target.value)} placeholder="What to discuss next time…" className="text-xs resize-none h-14" />
                  </div>
                </>
              )}

              {/* ── Update Stage ── */}
              {modal.type === "update_stage" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">New Stage *</Label>
                    <Select value={form.to_stage ?? ""} onValueChange={(v) => v && f("to_stage", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select stage" /></SelectTrigger>
                      <SelectContent>
                        {PIPELINE_STAGES.filter((s) => s !== "Won" && s !== "Lost").map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Notes *</Label>
                    <Textarea value={form.notes ?? ""} onChange={(e) => f("notes", e.target.value)} placeholder="Reason for stage change…" className="text-xs resize-none h-16" />
                  </div>
                </>
              )}

              {/* ── Mark Lost ── */}
              {modal.type === "mark_lost" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Lost Reason *</Label>
                    <Select value={form.lost_reason ?? ""} onValueChange={(v) => v && f("lost_reason", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select reason" /></SelectTrigger>
                      <SelectContent>
                        {LOST_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Notes *</Label>
                    <Textarea value={form.notes ?? ""} onChange={(e) => f("notes", e.target.value)} placeholder="What happened? Any future potential?" className="text-xs resize-none h-16" />
                  </div>
                </>
              )}

              {/* ── Mark Won ── */}
              {modal.type === "mark_won" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Settlement Value (₹)</Label>
                      <Input type="number" value={form.settlement_value ?? ""} onChange={(e) => f("settlement_value", e.target.value)} placeholder="0" className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Commission %</Label>
                      <Input type="number" value={form.commission_pct ?? ""} onChange={(e) => f("commission_pct", e.target.value)} placeholder="0" className="h-8 text-xs" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Notes *</Label>
                    <Textarea value={form.notes ?? ""} onChange={(e) => f("notes", e.target.value)} placeholder="Deal details, how it closed…" className="text-xs resize-none h-16" />
                  </div>
                </>
              )}

              {/* ── Site Visit Done ── */}
              {modal.type === "site_visit_done" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Outcome / Feedback *</Label>
                    <Textarea value={form.notes ?? ""} onChange={(e) => f("notes", e.target.value)} placeholder="Client reaction, what was seen, next steps…" className="text-xs resize-none h-16" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Schedule Follow-up (optional)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="date" value={form.next_date ?? ""} onChange={(e) => f("next_date", e.target.value)} className="h-8 text-xs" />
                      <Select value={form.next_type ?? ""} onValueChange={(v) => v && f("next_type", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                        <SelectContent>
                          {FOLLOW_UP_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {/* ── Update Notes ── */}
              {modal.type === "update_notes" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Notes *</Label>
                  <Textarea value={form.notes ?? ""} onChange={(e) => f("notes", e.target.value)} placeholder="Add notes to this follow-up and lead…" className="text-xs resize-none h-24" />
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setModal(null)} disabled={submitting}>Cancel</Button>
                <Button size="sm" className="flex-1" onClick={submitModal} disabled={submitting}>
                  {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Confirm
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
