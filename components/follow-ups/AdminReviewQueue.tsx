"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Phone, User, Calendar, TrendingUp, ArrowLeft, ArrowRight,
  CheckCircle, PauseCircle, MessageSquare, UserCheck, AlertOctagon,
  Inbox, ChevronLeft, ChevronRight, Loader2, History, Filter, Search,
  Clock, Star, MapPin, Home, Target, Banknote, ArrowRight as ArrowRightIcon,
} from "lucide-react";
import { getLeadReviewTheme, getTriggerLabel, getTriggerDetails } from "./review-theme";

// ── Types ────────────────────────────────────────────────────────────────────

interface ReviewLead {
  id: string;
  lead_number: string;
  full_name: string;
  status: string;
  activity_stage: string | null;
  temperature: string;
  phone: string;
  potential_lead_value: number | null;
  budget_min: number | null;
  budget_max: number | null;
  property_type: string | null;
  location_preference: string | null;
  purpose: string | null;
  lead_source: string;
  next_followup_date: string | null;
  followup_type: string | null;
  deleted_at: string | null;
  assigned_to: { id: string; name: string };
}

interface ReviewEvent {
  id: string;
  lead_id: string;
  opportunity_id: string | null;
  trigger_type: string;
  trigger_context: Record<string, unknown>;
  review_status: string;
  quality_score: string | null;
  review_notes: string | null;
  park_until: string | null;
  escalation_reason: string | null;
  actioned_at: string | null;
  created_at: string;
  lead: ReviewLead;
  opportunity: { id: string; opp_number: string; name: string } | null;
  triggered_by: { id: string; name: string };
  actioned_by: { id: string; name: string } | null;
}

interface Stats {
  pending: number;
  reviewed: number;
  parked: number;
  escalated: number;
  ask_agent: number;
  today: number;
}

interface FetchState {
  data: ReviewEvent[];
  total: number;
  total_pages: number;
  loading: boolean;
}

type ActionType = "reviewed" | "park" | "ask_agent" | "client_followup" | "escalate";

const FOLLOW_UP_TYPES = ["Call", "Email", "WhatsApp", "Visit", "Meeting", "Activity", "Internal"] as const;
const QUALITY_OPTIONS = [
  { value: "Excellent", label: "Excellent", color: "text-emerald-600" },
  { value: "Good",      label: "Good",      color: "text-green-600" },
  { value: "Average",   label: "Average",   color: "text-yellow-600" },
  { value: "Poor",      label: "Poor",      color: "text-red-600" },
] as const;

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    New: "bg-slate-100 text-slate-700",
    Prospect: "bg-blue-100 text-blue-700",
    SiteVisitCompleted: "bg-indigo-100 text-indigo-700",
    Negotiation: "bg-orange-100 text-orange-700",
    Won: "bg-emerald-100 text-emerald-700",
    Lost: "bg-red-100 text-red-700",
    InvalidLead: "bg-gray-100 text-gray-500",
    OnHold: "bg-yellow-100 text-yellow-700",
    Recycle: "bg-purple-100 text-purple-700",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

// ── Quality picker ────────────────────────────────────────────────────────────

function QualityPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
      {QUALITY_OPTIONS.map((q) => (
        <button
          key={q.value}
          type="button"
          onClick={() => onChange(q.value)}
          className={`flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium transition-colors ${
            value === q.value
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-muted-foreground"
          }`}
        >
          <Star className={`h-3 w-3 ${value === q.value ? "fill-current" : ""}`} />
          {q.label}
        </button>
      ))}
    </div>
  );
}

// ── Review Card ───────────────────────────────────────────────────────────────

function ReviewCard({
  event,
  index,
  total,
  onAction,
  onDirectReview,
  submitting,
}: {
  event: ReviewEvent;
  index: number;
  total: number;
  onAction: (type: ActionType) => void;
  onDirectReview: () => void;
  submitting: boolean;
}) {
  const theme = getLeadReviewTheme(event.lead?.temperature);
  const ctx = event.trigger_context as Record<string, unknown>;
  const details = getTriggerDetails(event.trigger_type, ctx);
  const ageMs = Date.now() - new Date(event.created_at).getTime();
  const ageHrs = Math.floor(ageMs / 3_600_000);
  const ageLabel = ageHrs < 1 ? "< 1h ago" : ageHrs < 24 ? `${ageHrs}h ago` : `${Math.floor(ageHrs / 24)}d ago`;
  const lead = event.lead;

  return (
    <div className={`rounded-xl border-2 ${theme.border} ${theme.card} overflow-hidden shadow-sm`}>
      {/* Temperature stripe */}
      <div className={`h-1 ${theme.dot}`} />

      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/leads/${event.lead?.id}`}
                className="font-semibold text-base hover:underline truncate"
                target="_blank"
              >
                {event.lead?.full_name ?? "Unknown Lead"}
              </Link>
              <span className="text-xs text-muted-foreground font-mono">{event.lead?.lead_number}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {event.lead?.temperature && (
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${theme.badge}`}>
                  {theme.label}
                </span>
              )}
              {event.lead?.status && <StatusBadge status={event.lead.status} />}
              {event.lead?.activity_stage && (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {event.lead.activity_stage}
                </span>
              )}
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground shrink-0">
            {index + 1} / {total}
          </div>
        </div>

        {/* What Changed */}
        <div className="rounded-lg bg-background/70 border border-border/60 p-3 space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{getTriggerLabel(event.trigger_type)}</p>
          <p className="text-sm font-semibold text-foreground">{details.headline}</p>
          {details.sub && <p className="text-xs text-muted-foreground">{details.sub}</p>}
          {details.notes && (
            <p className="text-xs text-foreground/80 italic border-l-2 border-primary/30 pl-2 mt-1">"{details.notes}"</p>
          )}
          <p className="text-[11px] text-muted-foreground pt-0.5">
            By <span className="font-medium text-foreground">{event.triggered_by?.name}</span>
            {" · "}{ageLabel}
          </p>
        </div>

        {/* Deal Context */}
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Deal Context</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {lead?.phone && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Phone className="h-3 w-3 shrink-0" />
                <a href={`tel:${lead.phone}`} className="hover:text-foreground">{lead.phone}</a>
              </div>
            )}
            {lead?.assigned_to && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <User className="h-3 w-3 shrink-0" />
                <span>{lead.assigned_to.name}</span>
              </div>
            )}
            {(lead?.budget_min || lead?.budget_max) && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Banknote className="h-3 w-3 shrink-0" />
                <span>
                  {lead.budget_min && lead.budget_max
                    ? `₹${(lead.budget_min / 100000).toFixed(0)}L – ₹${(lead.budget_max / 100000).toFixed(0)}L`
                    : lead.budget_max
                    ? `Up to ₹${(lead.budget_max / 100000).toFixed(0)}L`
                    : `₹${(lead.budget_min! / 100000).toFixed(0)}L+`}
                </span>
              </div>
            )}
            {lead?.potential_lead_value != null && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <TrendingUp className="h-3 w-3 shrink-0" />
                <span>₹{(lead.potential_lead_value / 100000).toFixed(0)}L pipeline value</span>
              </div>
            )}
            {lead?.property_type && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Home className="h-3 w-3 shrink-0" />
                <span>{lead.property_type}</span>
              </div>
            )}
            {lead?.location_preference && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span>{lead.location_preference}</span>
              </div>
            )}
            {lead?.purpose && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Target className="h-3 w-3 shrink-0" />
                <span>{lead.purpose}</span>
              </div>
            )}
            {lead?.activity_stage && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <ArrowRightIcon className="h-3 w-3 shrink-0" />
                <span>Activity: {lead.activity_stage}</span>
              </div>
            )}
            {lead?.next_followup_date && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="h-3 w-3 shrink-0" />
                <span>
                  Next{lead.followup_type ? ` ${lead.followup_type}` : ""}:{" "}
                  {new Date(lead.next_followup_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
              </div>
            )}
          </div>
          {event.opportunity && (
            <p className="text-xs text-muted-foreground">
              Opp:{" "}
              <Link href={`/opportunities/${event.opportunity.id}`} className="text-primary hover:underline">
                {event.opportunity.name}
              </Link>
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 border-t">
          <Button size="sm" variant="outline" className="gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-xs" onClick={onDirectReview} disabled={submitting}>
            <CheckCircle className="h-3.5 w-3.5" />Reviewed
          </Button>
          <Button size="sm" variant="outline" className="gap-1 text-amber-700 border-amber-200 hover:bg-amber-50 text-xs" onClick={() => onAction("park")} disabled={submitting}>
            <PauseCircle className="h-3.5 w-3.5" />Park
          </Button>
          <Button size="sm" variant="outline" className="gap-1 text-blue-700 border-blue-200 hover:bg-blue-50 text-xs" onClick={() => onAction("ask_agent")} disabled={submitting}>
            <MessageSquare className="h-3.5 w-3.5" />Ask Agent
          </Button>
          <Button size="sm" variant="outline" className="gap-1 text-purple-700 border-purple-200 hover:bg-purple-50 text-xs" onClick={() => onAction("client_followup")} disabled={submitting}>
            <UserCheck className="h-3.5 w-3.5" />Follow-up
          </Button>
          <Button size="sm" variant="outline" className="col-span-2 sm:col-span-1 gap-1 text-destructive border-destructive/30 hover:bg-destructive/10 text-xs" onClick={() => onAction("escalate")} disabled={submitting}>
            <AlertOctagon className="h-3.5 w-3.5" />Escalate
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── History row ───────────────────────────────────────────────────────────────

function HistoryRow({ event }: { event: ReviewEvent }) {
  const theme = getLeadReviewTheme(event.lead?.temperature);
  const statusColor: Record<string, string> = {
    Reviewed: "text-emerald-700 bg-emerald-50",
    Parked: "text-amber-700 bg-amber-50",
    AskAgent: "text-blue-700 bg-blue-50",
    Escalated: "text-destructive bg-destructive/10",
    Pending: "text-muted-foreground bg-muted",
  };

  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-0">
      <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${theme.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/leads/${event.lead?.id}`} className="font-medium text-sm hover:underline">
            {event.lead?.full_name}
          </Link>
          <span className="text-[11px] font-mono text-muted-foreground">{event.lead?.lead_number}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColor[event.review_status] ?? ""}`}>
            {event.review_status === "AskAgent" ? "Ask Agent" : event.review_status}
          </span>
          {event.quality_score && (
            <span className="text-[10px] text-muted-foreground">· {event.quality_score}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {getTriggerLabel(event.trigger_type)} · by {event.triggered_by?.name}
          {event.actioned_by && ` · actioned by ${event.actioned_by.name}`}
        </p>
        {event.review_notes && (
          <p className="text-xs text-muted-foreground italic mt-0.5">"{event.review_notes}"</p>
        )}
        {event.escalation_reason && (
          <p className="text-xs text-destructive mt-0.5">Escalation: {event.escalation_reason}</p>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground shrink-0 text-right">
        {new Date(event.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AdminReviewQueue({ users }: { users: { id: string; name: string }[] }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [queue, setQueue] = useState<FetchState>({ data: [], total: 0, total_pages: 1, loading: true });
  const [history, setHistory] = useState<FetchState>({ data: [], total: 0, total_pages: 1, loading: false });
  const [cardIndex, setCardIndex] = useState(0);
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [agentFilter, setAgentFilter] = useState("all");
  const [tempFilter, setTempFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [histPage, setHistPage] = useState(1);
  const [histStatus, setHistStatus] = useState("Reviewed");
  const [backfillChecked, setBackfillChecked] = useState(false);
  const [activeTab, setActiveTab] = useState("queue");
  const [todayOnly, setTodayOnly] = useState(false);

  // Action modal state
  const [actionModal, setActionModal] = useState<ActionType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quality, setQuality] = useState("");
  const [notes, setNotes] = useState("");
  const [parkUntil, setParkUntil] = useState("");
  const [escalReason, setEscalReason] = useState("");
  const [fuType, setFuType] = useState<string>("Call");
  const [fuDate, setFuDate] = useState("");

  const currentEvent = queue.data[cardIndex] ?? null;

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/admin/lead-review/stats");
    if (res.ok) setStats(await res.json());
  }, []);

  const fetchQueue = useCallback(async () => {
    setQueue((p) => ({ ...p, loading: true }));
    const params = new URLSearchParams({ status: statusFilter });
    if (agentFilter !== "all") params.set("agent", agentFilter);
    if (tempFilter !== "all") params.set("temperature", tempFilter);
    if (search) params.set("search", search);
    if (todayOnly) {
      const today = new Date().toISOString().split("T")[0];
      params.set("date_from", today);
      params.set("date_to", today);
    }
    params.set("per_page", "50");

    const res = await fetch(`/api/admin/lead-review?${params}`);
    if (res.ok) {
      const json = await res.json();
      setQueue({ data: json.data, total: json.total, total_pages: json.total_pages, loading: false });
      setCardIndex(0);
    } else {
      setQueue((p) => ({ ...p, loading: false }));
    }
  }, [statusFilter, agentFilter, tempFilter, search, todayOnly]);

  const fetchHistory = useCallback(async () => {
    setHistory((p) => ({ ...p, loading: true }));
    const params = new URLSearchParams({ status: histStatus, page: String(histPage), per_page: "30" });
    const res = await fetch(`/api/admin/lead-review?${params}`);
    if (res.ok) {
      const json = await res.json();
      setHistory({ data: json.data, total: json.total, total_pages: json.total_pages, loading: false });
    } else {
      setHistory((p) => ({ ...p, loading: false }));
    }
  }, [histStatus, histPage]);

  // On first open: if queue has never been actioned, auto-rebuild from source of truth.
  // Sets backfillChecked=true when done (even on error) so the reactive effect below can fire.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/lead-review/stats");
        if (res.ok) {
          const s: Stats = await res.json();
          setStats(s);
          const neverUsed = s.reviewed === 0 && s.parked === 0 && s.escalated === 0 && s.ask_agent === 0;
          if (neverUsed) {
            await fetch("/api/admin/lead-review/backfill", { method: "POST" });
            const res2 = await fetch("/api/admin/lead-review/stats");
            if (res2.ok) setStats(await res2.json());
          }
        }
      } finally {
        setBackfillChecked(true);
      }
    })();
  }, []);
  // Reactive: re-fetches queue whenever search/filters change. Gated on backfillChecked
  // so it always runs after the auto-init (and after any backfill) rather than racing it.
  useEffect(() => { if (!backfillChecked) return; void fetchQueue(); }, [fetchQueue, backfillChecked]);
  useEffect(() => { void fetchHistory(); }, [fetchHistory]);

  // Keyboard shortcuts
  const actionModalRef = useRef(actionModal);
  actionModalRef.current = actionModal;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (actionModalRef.current) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === "n") {
        setCardIndex((i) => Math.min(i + 1, queue.data.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "p") {
        setCardIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "r") openModal("reviewed");
      else if (e.key === "k") openModal("park");
      else if (e.key === "a") openModal("ask_agent");
      else if (e.key === "f") openModal("client_followup");
      else if (e.key === "e") openModal("escalate");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [queue.data.length]);

  async function handleDirectReview() {
    if (!currentEvent || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/lead-review/${currentEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reviewed" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { error?: string }).error ?? "Action failed");
        return;
      }
      toast.success("Marked as reviewed");
      setQueue((prev) => {
        const next = prev.data.filter((e) => e.id !== currentEvent.id);
        return { ...prev, data: next, total: prev.total - 1 };
      });
      setCardIndex((i) => Math.max(0, Math.min(i, queue.data.length - 2)));
      void fetchStats();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function openModal(type: ActionType) {
    if (!currentEvent) return;
    setQuality("");
    setNotes("");
    setParkUntil("");
    setEscalReason("");
    setFuType("Call");
    setFuDate("");
    setActionModal(type);
  }

  async function submitAction() {
    if (!currentEvent || !actionModal) return;
    if (actionModal === "park" && !parkUntil) { toast.error("Park until date is required"); return; }
    if (actionModal === "escalate" && !escalReason.trim()) { toast.error("Escalation reason is required"); return; }
    if (actionModal === "client_followup" && !fuDate) { toast.error("Follow-up date is required"); return; }

    setSubmitting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: Record<string, any> = { action: actionModal };
      if (notes) body.review_notes = notes;
      if (quality) body.quality_score = quality;
      if (actionModal === "park") body.park_until = parkUntil;
      if (actionModal === "escalate") body.escalation_reason = escalReason;
      if (actionModal === "client_followup") {
        body.followup_type = fuType;
        body.followup_scheduled_at = fuDate;
      }

      const res = await fetch(`/api/admin/lead-review/${currentEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Action failed");
        return;
      }

      toast.success(getActionSuccessMsg(actionModal));
      setActionModal(null);

      // Remove from queue and advance
      setQueue((prev) => {
        const next = prev.data.filter((e) => e.id !== currentEvent.id);
        return { ...prev, data: next, total: prev.total - 1 };
      });
      setCardIndex((i) => Math.max(0, Math.min(i, queue.data.length - 2)));
      void fetchStats();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 mt-2">
      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {([
            {
              label: "Pending", value: stats.pending, color: "text-foreground",
              isActive: activeTab === "queue" && !todayOnly,
              onClick: () => { setActiveTab("queue"); setStatusFilter("Pending"); setTodayOnly(false); },
            },
            {
              label: "Today", value: stats.today, color: "text-orange-600",
              isActive: activeTab === "queue" && todayOnly,
              onClick: () => { setActiveTab("queue"); setStatusFilter("Pending"); setTodayOnly(true); },
            },
            {
              label: "Ask Agent", value: stats.ask_agent, color: "text-blue-600",
              isActive: activeTab === "history" && histStatus === "AskAgent",
              onClick: () => { setActiveTab("history"); setHistStatus("AskAgent"); setHistPage(1); },
            },
            {
              label: "Parked", value: stats.parked, color: "text-amber-600",
              isActive: activeTab === "history" && histStatus === "Parked",
              onClick: () => { setActiveTab("history"); setHistStatus("Parked"); setHistPage(1); },
            },
            {
              label: "Escalated", value: stats.escalated, color: "text-destructive",
              isActive: activeTab === "history" && histStatus === "Escalated",
              onClick: () => { setActiveTab("history"); setHistStatus("Escalated"); setHistPage(1); },
            },
            {
              label: "Reviewed", value: stats.reviewed, color: "text-emerald-600",
              isActive: activeTab === "history" && histStatus === "Reviewed",
              onClick: () => { setActiveTab("history"); setHistStatus("Reviewed"); setHistPage(1); },
            },
          ] as const).map((s) => (
            <button
              key={s.label}
              onClick={s.onClick}
              className={`text-left rounded-lg border bg-card p-0 transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                s.isActive ? "ring-2 ring-primary border-primary" : "hover:border-muted-foreground/40"
              }`}
            >
              <div className="py-2 px-3">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Inner Tabs: Queue | History */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="queue" className="gap-1 text-xs sm:text-sm">
            <Inbox className="h-3.5 w-3.5" />
            Queue
            {stats && stats.pending > 0 && (
              <span className="ml-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 leading-5">
                {stats.pending}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1 text-xs sm:text-sm">
            <History className="h-3.5 w-3.5" />
            History
          </TabsTrigger>
        </TabsList>

        {/* ── Queue Tab ── */}
        <TabsContent value="queue" className="space-y-3 mt-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {todayOnly && (
              <button
                onClick={() => setTodayOnly(false)}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-medium hover:bg-orange-200 transition-colors"
              >
                <Clock className="h-3 w-3" />
                Today only ×
              </button>
            )}
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search lead…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Select value={tempFilter} onValueChange={(v) => v && setTempFilter(v)}>
              <SelectTrigger className="h-8 text-xs w-32">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue>{tempFilter === "all" ? "All temps" : tempFilter}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All temps</SelectItem>
                <SelectItem value="Hot">Hot</SelectItem>
                <SelectItem value="Warm">Warm</SelectItem>
                <SelectItem value="Cold">Cold</SelectItem>
                <SelectItem value="FollowUpLater">Follow Up Later</SelectItem>
              </SelectContent>
            </Select>
            {users.length > 0 && (
              <Select value={agentFilter} onValueChange={(v) => v && setAgentFilter(v)}>
                <SelectTrigger className="h-8 text-xs w-36">
                  <SelectValue>{agentFilter === "all" ? "All agents" : users.find((u) => u.id === agentFilter)?.name ?? "Agent"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All agents</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Card + Navigation */}
          {queue.loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : queue.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle className="h-10 w-10 text-emerald-400 mb-3" />
              <p className="text-base font-medium">Queue is clear</p>
              <p className="text-sm text-muted-foreground mt-1">No pending events match your filters</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Navigation bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={cardIndex === 0}
                    onClick={() => setCardIndex((i) => Math.max(0, i - 1))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {cardIndex + 1} of {queue.data.length}
                    {queue.total > queue.data.length && ` (${queue.total} total)`}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={cardIndex >= queue.data.length - 1}
                    onClick={() => setCardIndex((i) => Math.min(queue.data.length - 1, i + 1))}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground hidden sm:block">
                  ← → navigate · r=reviewed · k=park · a=ask · f=followup · e=escalate
                </p>
              </div>

              {/* Card */}
              {currentEvent && (
                <div className="max-w-lg mx-auto">
                  <ReviewCard
                    event={currentEvent}
                    index={cardIndex}
                    total={queue.data.length}
                    onAction={openModal}
                    onDirectReview={handleDirectReview}
                    submitting={submitting}
                  />
                </div>
              )}

              {/* Queue list preview */}
              {queue.data.length > 1 && (
                <div className="mt-4 rounded-lg border bg-muted/20 divide-y max-h-48 overflow-y-auto">
                  {queue.data.map((ev, idx) => {
                    const theme = getLeadReviewTheme(ev.lead?.temperature);
                    return (
                      <button
                        key={ev.id}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors text-xs ${idx === cardIndex ? "bg-muted/50 font-medium" : ""}`}
                        onClick={() => setCardIndex(idx)}
                      >
                        <div className={`w-2 h-2 rounded-full shrink-0 ${theme.dot}`} />
                        <span className="truncate flex-1">{ev.lead?.full_name}</span>
                        <span className="text-muted-foreground shrink-0">{getTriggerLabel(ev.trigger_type)}</span>
                        <span className="text-muted-foreground shrink-0">{ev.triggered_by?.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── History Tab ── */}
        <TabsContent value="history" className="space-y-3 mt-3">
          <div className="flex items-center gap-2">
            <Select value={histStatus} onValueChange={(v) => { if (v) { setHistStatus(v); setHistPage(1); } }}>
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Reviewed">Reviewed</SelectItem>
                <SelectItem value="Parked">Parked</SelectItem>
                <SelectItem value="AskAgent">Ask Agent</SelectItem>
                <SelectItem value="Escalated">Escalated</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{history.total} records</span>
          </div>

          {history.loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : history.data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No {histStatus.toLowerCase()} events</p>
          ) : (
            <div className="rounded-lg border bg-card p-3 divide-y">
              {history.data.map((ev) => <HistoryRow key={ev.id} event={ev} />)}
            </div>
          )}

          {history.total_pages > 1 && (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={histPage === 1}
                onClick={() => setHistPage((p) => p - 1)}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Prev
              </Button>
              <span className="text-xs text-muted-foreground">Page {histPage} / {history.total_pages}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={histPage >= history.total_pages}
                onClick={() => setHistPage((p) => p + 1)}
              >
                Next
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Action Modals ── */}
      <Dialog open={!!actionModal} onOpenChange={(o) => { if (!o) setActionModal(null); }}>
        <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{getModalTitle(actionModal)}</DialogTitle>
          </DialogHeader>

          {actionModal && (
            <div className="space-y-3 pt-1">
              {currentEvent && (
                <p className="text-sm text-muted-foreground">
                  Lead:{" "}
                  <span className="font-medium text-foreground">
                    {currentEvent.lead?.full_name} ({currentEvent.lead?.lead_number})
                  </span>
                </p>
              )}

              {/* Quality score — for client_followup only */}
              {actionModal === "client_followup" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Quality Score</Label>
                  <QualityPicker value={quality} onChange={setQuality} />
                </div>
              )}

              {/* Park until date */}
              {actionModal === "park" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Park Until *</Label>
                  <Input
                    type="date"
                    value={parkUntil}
                    onChange={(e) => setParkUntil(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              )}

              {/* Follow-up fields */}
              {actionModal === "client_followup" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Type</Label>
                    <Select value={fuType} onValueChange={(v) => v && setFuType(v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FOLLOW_UP_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Schedule *</Label>
                    <Input
                      type="datetime-local"
                      value={fuDate}
                      onChange={(e) => setFuDate(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Escalation reason */}
              {actionModal === "escalate" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Escalation Reason *</Label>
                  <Textarea
                    value={escalReason}
                    onChange={(e) => setEscalReason(e.target.value)}
                    placeholder="Describe why this lead needs escalation…"
                    className="text-xs resize-none h-20"
                  />
                </div>
              )}

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs">Notes {actionModal === "ask_agent" ? "(required — will be sent to agent)" : "(optional)"}</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes…"
                  className="text-xs resize-none h-16"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setActionModal(null)} disabled={submitting}>
                  Cancel
                </Button>
                <Button size="sm" className="flex-1" onClick={submitAction} disabled={submitting}>
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

function getModalTitle(action: ActionType | null): string {
  switch (action) {
    case "reviewed":       return "Mark as Reviewed";
    case "park":           return "Park Lead";
    case "ask_agent":      return "Ask Agent";
    case "client_followup": return "Schedule Client Follow-up";
    case "escalate":       return "Escalate Lead";
    default:               return "Action";
  }
}

function getActionSuccessMsg(action: ActionType): string {
  switch (action) {
    case "reviewed":       return "Marked as reviewed";
    case "park":           return "Lead parked";
    case "ask_agent":      return "Agent notified";
    case "client_followup": return "Follow-up scheduled";
    case "escalate":       return "Lead escalated";
    default:               return "Done";
  }
}
