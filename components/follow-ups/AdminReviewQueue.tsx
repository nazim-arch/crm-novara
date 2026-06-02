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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Phone, User, Calendar, TrendingUp, ArrowLeft, ArrowRight,
  CheckCircle, PauseCircle, MessageSquare, UserCheck, AlertOctagon,
  Inbox, ChevronLeft, ChevronRight, Loader2, History, Filter, Search,
  Clock, Star, MapPin, Home, Target, Banknote, MoreHorizontal,
} from "lucide-react";
import { getLeadReviewTheme, getTriggerLabel, getTriggerDetails, getTriggerChipClass } from "./review-theme";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  alternate_requirement: string | null;
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
  { value: "Excellent", label: "Excellent" },
  { value: "Good",      label: "Good" },
  { value: "Average",   label: "Average" },
  { value: "Poor",      label: "Poor" },
] as const;

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getReviewGradient(temp: string | null | undefined): string {
  switch (temp) {
    case "Hot":           return "bg-gradient-to-br from-red-100 via-orange-50 to-red-50 dark:from-red-900/50 dark:via-orange-900/30 dark:to-red-900/20";
    case "Warm":          return "bg-gradient-to-br from-amber-100 via-yellow-50 to-amber-50 dark:from-amber-900/50 dark:via-yellow-900/30 dark:to-amber-900/20";
    case "Cold":          return "bg-gradient-to-br from-slate-100 via-blue-50 to-slate-50 dark:from-slate-900/50 dark:via-blue-900/20 dark:to-slate-900/20";
    case "FollowUpLater": return "bg-gradient-to-br from-purple-100 via-indigo-50 to-purple-50 dark:from-purple-900/50 dark:via-indigo-900/20 dark:to-purple-900/20";
    default:              return "bg-muted/50";
  }
}

function ageString(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const hrs = Math.floor(ms / 3_600_000);
  if (hrs < 1) return "< 1h ago";
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ageShort(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const hrs = Math.floor(ms / 3_600_000);
  if (hrs < 1) return "< 1h";
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatPill({
  label, value, cls, isActive, onClick,
}: {
  label: string; value: number; cls?: string; isActive?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-2 rounded-full border whitespace-nowrap shrink-0 select-none shadow-sm transition-all snap-start ${
        isActive
          ? "ring-2 ring-primary border-primary bg-card"
          : "bg-card hover:border-muted-foreground/40"
      }`}
    >
      <span className={`text-sm font-bold tabular-nums ${cls ?? "text-foreground"}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    New: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    Contacted: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    Prospect: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    SiteVisitCompleted: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    Negotiation: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    Won: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    Lost: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    InvalidLead: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
    OnHold: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
    Recycle: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

function QualityPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
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

function ActionModal({
  open, onOpenChange, title, isMobile, children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  isMobile: boolean;
  children: React.ReactNode;
}) {
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl px-0 max-h-[88dvh]">
          <SheetHeader className="px-4 pb-2 border-b">
            <SheetTitle className="text-base text-left">{title}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pt-3 pb-8 overflow-y-auto">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

// ── ReviewCardBody ─────────────────────────────────────────────────────────────

function ReviewCardBody({ event }: { event: ReviewEvent }) {
  const theme = getLeadReviewTheme(event.lead?.temperature);
  const gradient = getReviewGradient(event.lead?.temperature);
  const ctx = event.trigger_context as Record<string, unknown>;
  const details = getTriggerDetails(event.trigger_type, ctx);
  const ageLabel = ageString(event.created_at);
  const lead = event.lead;
  const chipCls = getTriggerChipClass(event.trigger_type);

  return (
    <div>
      {/* Gradient header */}
      <div className={`${gradient} px-4 pt-4 pb-3 border-b border-border/40`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Link
              href={`/leads/${event.lead?.id}`}
              className="text-lg font-semibold tracking-tight hover:underline line-clamp-1 block"
              target="_blank"
            >
              {event.lead?.full_name ?? "Unknown Lead"}
            </Link>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{event.lead?.lead_number}</p>
          </div>
          {event.lead?.temperature && (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${theme.badge}`}>
              {theme.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {event.lead?.status && <StatusBadge status={event.lead.status} />}
          {event.lead?.activity_stage && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-background/60 dark:bg-background/30 text-muted-foreground border border-border/50">
              {event.lead.activity_stage}
            </span>
          )}
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${chipCls}`}>
            {getTriggerLabel(event.trigger_type)}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">
        {/* What Changed */}
        <div className="rounded-lg bg-muted/30 border border-border/60 p-3 space-y-1.5">
          <p className="text-base font-medium text-foreground">{details.headline}</p>
          {details.sub && <p className="text-xs text-muted-foreground">{details.sub}</p>}
          {details.notes && (
            <p className="text-xs text-foreground/80 italic border-l-2 border-primary/30 pl-2 mt-1">
              &ldquo;{details.notes}&rdquo;
            </p>
          )}
          <p className="text-[11px] text-muted-foreground pt-0.5">
            By <span className="font-medium text-foreground">{event.triggered_by?.name}</span>
            {" · "}{ageLabel}
          </p>
        </div>

        {/* Deal Context */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Deal Context</p>
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
                <span>₹{(lead.potential_lead_value / 100000).toFixed(0)}L pipeline</span>
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
            <p className="text-xs text-muted-foreground mt-1">
              Opp:{" "}
              <Link href={`/opportunities/${event.opportunity.id}`} className="text-primary hover:underline">
                {event.opportunity.name}
              </Link>
            </p>
          )}
        </div>

        {/* Notes */}
        {lead?.alternate_requirement && (
          <div className="rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/50 p-3 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">Notes</p>
            <p className="text-xs text-foreground leading-relaxed whitespace-pre-line">{lead.alternate_requirement}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── HistoryTimelineItem ────────────────────────────────────────────────────────

const HISTORY_DOT: Record<string, string> = {
  Reviewed:  "bg-emerald-500",
  Parked:    "bg-amber-500",
  AskAgent:  "bg-blue-500",
  Escalated: "bg-destructive",
  Pending:   "bg-muted-foreground",
};

const HISTORY_LABEL: Record<string, string> = {
  Reviewed:  "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30",
  Parked:    "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30",
  AskAgent:  "text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/30",
  Escalated: "text-destructive bg-destructive/10",
  Pending:   "text-muted-foreground bg-muted",
};

function HistoryTimelineItem({ event, isLast }: { event: ReviewEvent; isLast: boolean }) {
  const theme = getLeadReviewTheme(event.lead?.temperature);
  const dotCls = HISTORY_DOT[event.review_status] ?? "bg-muted-foreground";
  const labelCls = HISTORY_LABEL[event.review_status] ?? "text-muted-foreground bg-muted";
  const displayStatus = event.review_status === "AskAgent" ? "Ask Agent" : event.review_status;

  return (
    <div className={`relative flex gap-3 ${isLast ? "pb-2" : "pb-4"}`}>
      <div className={`absolute -left-[18px] top-1.5 w-3 h-3 rounded-full border-2 border-background shrink-0 ${dotCls}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/leads/${event.lead?.id}`} className="font-medium text-sm hover:underline">
                {event.lead?.full_name}
              </Link>
              <span className="text-[11px] font-mono text-muted-foreground">{event.lead?.lead_number}</span>
              <div className={`w-1.5 h-1.5 rounded-full ${theme.dot}`} />
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${labelCls}`}>
                {displayStatus}
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
              <p className="text-xs text-muted-foreground italic mt-0.5">&ldquo;{event.review_notes}&rdquo;</p>
            )}
            {event.escalation_reason && (
              <p className="text-xs text-destructive mt-0.5">Escalation: {event.escalation_reason}</p>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
            {new Date(event.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── ModalFormContent ───────────────────────────────────────────────────────────

function ModalFormContent({
  modal, currentEvent, quality, setQuality, notes, setNotes,
  parkUntil, setParkUntil, escalReason, setEscalReason,
  fuType, setFuType, fuDate, setFuDate, submitting, onClose, onSubmit,
}: {
  modal: ActionType;
  currentEvent: ReviewEvent;
  quality: string; setQuality: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
  parkUntil: string; setParkUntil: (v: string) => void;
  escalReason: string; setEscalReason: (v: string) => void;
  fuType: string; setFuType: (v: string) => void;
  fuDate: string; setFuDate: (v: string) => void;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-3 pt-1">
      <p className="text-sm text-muted-foreground">
        Lead:{" "}
        <span className="font-medium text-foreground">
          {currentEvent.lead?.full_name} ({currentEvent.lead?.lead_number})
        </span>
      </p>

      {modal === "client_followup" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Quality Score</Label>
          <QualityPicker value={quality} onChange={setQuality} />
        </div>
      )}

      {modal === "park" && (
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

      {modal === "client_followup" && (
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

      {modal === "escalate" && (
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

      <div className="space-y-1.5">
        <Label className="text-xs">
          Notes {modal === "ask_agent" ? "(will be sent to agent)" : "(optional)"}
        </Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes…"
          className="text-xs resize-none h-16"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" className="flex-1" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button size="sm" className="flex-1" onClick={onSubmit} disabled={submitting}>
          {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Confirm
        </Button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function AdminReviewQueue({ users }: { users: { id: string; name: string }[] }) {
  const isMobile = useMediaQuery("(max-width: 1023px)");

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
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [quality, setQuality] = useState("");
  const [notes, setNotes] = useState("");
  const [parkUntil, setParkUntil] = useState("");
  const [escalReason, setEscalReason] = useState("");
  const [fuType, setFuType] = useState<string>("Call");
  const [fuDate, setFuDate] = useState("");

  // Card slide animation
  const [slideDir, setSlideDir] = useState<"left" | "right" | null>(null);
  const swipeStartX = useRef<number | null>(null);

  const currentEvent = queue.data[cardIndex] ?? null;

  function goNext() {
    if (cardIndex >= queue.data.length - 1) return;
    setSlideDir("left");
    setCardIndex((i) => i + 1);
  }
  function goPrev() {
    if (cardIndex <= 0) return;
    setSlideDir("right");
    setCardIndex((i) => i - 1);
  }

  useEffect(() => {
    if (!slideDir) return;
    const t = setTimeout(() => setSlideDir(null), 300);
    return () => clearTimeout(t);
  }, [slideDir, cardIndex]);

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

  useEffect(() => { if (!backfillChecked) return; void fetchQueue(); }, [fetchQueue, backfillChecked]);
  useEffect(() => { void fetchHistory(); }, [fetchHistory]);

  // Keyboard shortcuts
  const actionModalRef = useRef(actionModal);
  actionModalRef.current = actionModal;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (actionModalRef.current) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === "n") goNext();
      else if (e.key === "ArrowLeft" || e.key === "p") goPrev();
      else if (e.key === "r") openModal("reviewed");
      else if (e.key === "k") openModal("park");
      else if (e.key === "a") openModal("ask_agent");
      else if (e.key === "f") openModal("client_followup");
      else if (e.key === "e") openModal("escalate");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        toast.error((err as { error?: string }).error ?? "Action failed");
        return;
      }

      toast.success(getActionSuccessMsg(actionModal));
      setActionModal(null);
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

  // Build stat items (shared between mobile pills and desktop grid)
  const statItems = stats
    ? [
        {
          label: "Pending", value: stats.pending, cls: "text-foreground",
          isActive: activeTab === "queue" && !todayOnly,
          onClick: () => { setActiveTab("queue"); setStatusFilter("Pending"); setTodayOnly(false); },
        },
        {
          label: "Today", value: stats.today, cls: "text-orange-600",
          isActive: activeTab === "queue" && todayOnly,
          onClick: () => { setActiveTab("queue"); setStatusFilter("Pending"); setTodayOnly(true); },
        },
        {
          label: "Ask Agent", value: stats.ask_agent, cls: "text-blue-600",
          isActive: activeTab === "history" && histStatus === "AskAgent",
          onClick: () => { setActiveTab("history"); setHistStatus("AskAgent"); setHistPage(1); },
        },
        {
          label: "Parked", value: stats.parked, cls: "text-amber-600",
          isActive: activeTab === "history" && histStatus === "Parked",
          onClick: () => { setActiveTab("history"); setHistStatus("Parked"); setHistPage(1); },
        },
        {
          label: "Escalated", value: stats.escalated, cls: "text-destructive",
          isActive: activeTab === "history" && histStatus === "Escalated",
          onClick: () => { setActiveTab("history"); setHistStatus("Escalated"); setHistPage(1); },
        },
        {
          label: "Reviewed", value: stats.reviewed, cls: "text-emerald-600",
          isActive: activeTab === "history" && histStatus === "Reviewed",
          onClick: () => { setActiveTab("history"); setHistStatus("Reviewed"); setHistPage(1); },
        },
      ]
    : [];

  const currentTheme = currentEvent ? getLeadReviewTheme(currentEvent.lead?.temperature) : null;

  return (
    <div className="space-y-4 mt-2">
      {/* Stats — mobile scrollable pills */}
      {stats && (
        <div className="sm:hidden flex gap-2 overflow-x-auto pb-1 scrollbar-hide snap-x">
          {statItems.map((s) => (
            <StatPill key={s.label} label={s.label} value={s.value} cls={s.cls} isActive={s.isActive} onClick={s.onClick} />
          ))}
        </div>
      )}

      {/* Stats — desktop grid (enhanced typography) */}
      {stats && (
        <div className="hidden sm:grid grid-cols-6 gap-2">
          {statItems.map((s) => (
            <button
              key={s.label}
              onClick={s.onClick}
              className={`text-left rounded-xl border bg-card p-0 transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                s.isActive ? "ring-2 ring-primary border-primary" : "hover:border-muted-foreground/40"
              }`}
            >
              <div className="py-3 px-3">
                <p className={`text-2xl font-bold tabular-nums ${s.cls}`}>{s.value}</p>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
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
        <TabsContent value="queue" className="mt-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-3">
            {todayOnly && (
              <button
                onClick={() => setTodayOnly(false)}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-xs font-medium hover:bg-orange-200 transition-colors"
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

          {queue.loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : queue.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle className="h-12 w-12 text-emerald-400 mb-3" />
              <p className="text-base font-semibold">Queue is clear</p>
              <p className="text-sm text-muted-foreground mt-1">No pending events match your filters</p>
            </div>
          ) : (
            <>
              {/* ── Mobile layout (< lg) ── */}
              <div className="lg:hidden space-y-3">
                {/* Navigation bar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={cardIndex === 0} onClick={goPrev}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <div className="flex items-center gap-1.5 bg-muted/60 rounded-full px-3 py-1.5">
                      <div className="w-16 h-1 bg-muted-foreground/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-300"
                          style={{ width: `${((cardIndex + 1) / queue.data.length) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground tabular-nums">
                        {cardIndex + 1}/{queue.data.length}
                      </span>
                    </div>
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={cardIndex >= queue.data.length - 1} onClick={goNext}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground hidden sm:block">
                    ← → navigate · r=reviewed · k=park · a=ask · f=followup · e=escalate
                  </p>
                </div>

                {/* Swipeable card */}
                {currentEvent && (
                  <div
                    className="touch-pan-y"
                    onPointerDown={(e) => { swipeStartX.current = e.clientX; }}
                    onPointerUp={(e) => {
                      if (swipeStartX.current === null) return;
                      const delta = e.clientX - swipeStartX.current;
                      swipeStartX.current = null;
                      if (Math.abs(delta) < 60) return;
                      if (delta < 0) goNext(); else goPrev();
                    }}
                    onPointerCancel={() => { swipeStartX.current = null; }}
                  >
                    <div
                      key={cardIndex}
                      className={
                        slideDir === "left"
                          ? "animate-slide-from-right"
                          : slideDir === "right"
                          ? "animate-slide-from-left"
                          : ""
                      }
                    >
                      <div className={`rounded-xl border-2 ${currentTheme?.border ?? "border-border"} bg-card overflow-hidden shadow-sm`}>
                        <ReviewCardBody event={currentEvent} />
                        {/* Mobile action bar */}
                        <div className="border-t p-3 grid grid-cols-2 gap-2">
                          <Button
                            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={handleDirectReview}
                            disabled={submitting}
                          >
                            {submitting
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <CheckCircle className="h-4 w-4" />}
                            Reviewed
                          </Button>
                          <Button
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => setMobileDrawerOpen(true)}
                            disabled={submitting}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            More Actions
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Desktop two-panel layout (lg+) ── */}
              <div
                className="hidden lg:flex rounded-xl border bg-card overflow-hidden shadow-sm"
                style={{ height: "calc(100vh - 320px)", minHeight: "520px" }}
              >
                {/* Left panel — queue list */}
                <div className="w-72 border-r flex flex-col bg-muted/10 shrink-0">
                  <div className="px-3 py-2 border-b flex items-center justify-between bg-card/80">
                    <span className="text-xs text-muted-foreground">
                      {queue.total > queue.data.length
                        ? `${queue.data.length} of ${queue.total}`
                        : `${queue.data.length} items`}
                    </span>
                    <div className="flex items-center gap-1.5 bg-muted/60 rounded-full px-2 py-1">
                      <div className="w-10 h-1 bg-muted-foreground/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-300"
                          style={{ width: `${((cardIndex + 1) / queue.data.length) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {cardIndex + 1}/{queue.data.length}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y">
                    {queue.data.map((ev, idx) => {
                      const t = getLeadReviewTheme(ev.lead?.temperature);
                      const isHot = ev.lead?.temperature === "Hot";
                      return (
                        <button
                          key={ev.id}
                          onClick={() => setCardIndex(idx)}
                          className={`w-full flex items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 border-l-2 ${
                            idx === cardIndex
                              ? "bg-muted border-l-primary"
                              : isHot
                              ? "border-l-red-300 dark:border-l-red-700"
                              : "border-l-transparent"
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${t.dot}`} />
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs truncate ${idx === cardIndex ? "font-semibold" : "font-medium"}`}>
                              {ev.lead?.full_name}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {getTriggerLabel(ev.trigger_type)}
                            </p>
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {ageShort(ev.created_at)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Nav controls at bottom of list */}
                  <div className="border-t px-3 py-2 flex items-center justify-between bg-card/80">
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={cardIndex === 0} onClick={goPrev}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <p className="text-[10px] text-muted-foreground">← → or n/p</p>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={cardIndex >= queue.data.length - 1} onClick={goNext}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Right panel — detail + sticky footer */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {currentEvent ? (
                    <>
                      <div className="flex-1 overflow-y-auto">
                        <div
                          key={cardIndex}
                          className={
                            slideDir === "left"
                              ? "animate-slide-from-right"
                              : slideDir === "right"
                              ? "animate-slide-from-left"
                              : ""
                          }
                        >
                          <ReviewCardBody event={currentEvent} />
                        </div>
                      </div>
                      {/* Sticky action footer */}
                      <div className="border-t px-4 py-3 flex gap-2 bg-card shrink-0">
                        <Button
                          size="sm"
                          className="flex-1 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white min-w-0"
                          onClick={handleDirectReview}
                          disabled={submitting}
                        >
                          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                          <span className="hidden xl:inline">Reviewed</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1 text-amber-700 border-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/30 min-w-0"
                          onClick={() => openModal("park")}
                          disabled={submitting}
                        >
                          <PauseCircle className="h-3.5 w-3.5" />
                          <span className="hidden xl:inline">Park</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1 text-blue-700 border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/30 min-w-0"
                          onClick={() => openModal("ask_agent")}
                          disabled={submitting}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          <span className="hidden xl:inline">Ask Agent</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1 text-purple-700 border-purple-200 hover:bg-purple-50 dark:hover:bg-purple-950/30 min-w-0"
                          onClick={() => openModal("client_followup")}
                          disabled={submitting}
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          <span className="hidden xl:inline">Follow-up</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1 text-destructive border-destructive/30 hover:bg-destructive/10 min-w-0"
                          onClick={() => openModal("escalate")}
                          disabled={submitting}
                        >
                          <AlertOctagon className="h-3.5 w-3.5" />
                          <span className="hidden xl:inline">Escalate</span>
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                      Select an item from the list
                    </div>
                  )}
                </div>
              </div>
            </>
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
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <History className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No {histStatus.toLowerCase()} events</p>
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-4">
              <div className="relative pl-6">
                <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
                {history.data.map((ev, idx) => (
                  <HistoryTimelineItem
                    key={ev.id}
                    event={ev}
                    isLast={idx === history.data.length - 1}
                  />
                ))}
              </div>
            </div>
          )}

          {history.total_pages > 1 && (
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" disabled={histPage === 1} onClick={() => setHistPage((p) => p - 1)}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />Prev
              </Button>
              <span className="text-xs text-muted-foreground">Page {histPage} / {history.total_pages}</span>
              <Button variant="outline" size="sm" disabled={histPage >= history.total_pages} onClick={() => setHistPage((p) => p + 1)}>
                Next<ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Mobile Drawer — more actions ── */}
      <Drawer open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
        <DrawerContent>
          <DrawerHeader className="pb-2 border-b">
            <DrawerTitle className="text-base text-left">More Actions</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pt-3 pb-8 grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="gap-1.5 h-12 text-amber-700 border-amber-200 hover:bg-amber-50"
              onClick={() => { setMobileDrawerOpen(false); openModal("park"); }}
            >
              <PauseCircle className="h-4 w-4" />Park
            </Button>
            <Button
              variant="outline"
              className="gap-1.5 h-12 text-blue-700 border-blue-200 hover:bg-blue-50"
              onClick={() => { setMobileDrawerOpen(false); openModal("ask_agent"); }}
            >
              <MessageSquare className="h-4 w-4" />Ask Agent
            </Button>
            <Button
              variant="outline"
              className="gap-1.5 h-12 text-purple-700 border-purple-200 hover:bg-purple-50"
              onClick={() => { setMobileDrawerOpen(false); openModal("client_followup"); }}
            >
              <UserCheck className="h-4 w-4" />Follow-up
            </Button>
            <Button
              variant="outline"
              className="gap-1.5 h-12 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => { setMobileDrawerOpen(false); openModal("escalate"); }}
            >
              <AlertOctagon className="h-4 w-4" />Escalate
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── Action Modal ── */}
      <ActionModal
        open={!!actionModal}
        onOpenChange={(o) => { if (!o) setActionModal(null); }}
        title={getModalTitle(actionModal)}
        isMobile={isMobile}
      >
        {actionModal && currentEvent && (
          <ModalFormContent
            modal={actionModal}
            currentEvent={currentEvent}
            quality={quality}
            setQuality={setQuality}
            notes={notes}
            setNotes={setNotes}
            parkUntil={parkUntil}
            setParkUntil={setParkUntil}
            escalReason={escalReason}
            setEscalReason={setEscalReason}
            fuType={fuType}
            setFuType={setFuType}
            fuDate={fuDate}
            setFuDate={setFuDate}
            submitting={submitting}
            onClose={() => setActionModal(null)}
            onSubmit={submitAction}
          />
        )}
      </ActionModal>
    </div>
  );
}

function getModalTitle(action: ActionType | null): string {
  switch (action) {
    case "reviewed":        return "Mark as Reviewed";
    case "park":            return "Park Lead";
    case "ask_agent":       return "Ask Agent";
    case "client_followup": return "Schedule Client Follow-up";
    case "escalate":        return "Escalate Lead";
    default:                return "Action";
  }
}

function getActionSuccessMsg(action: ActionType): string {
  switch (action) {
    case "reviewed":        return "Marked as reviewed";
    case "park":            return "Lead parked";
    case "ask_agent":       return "Agent notified";
    case "client_followup": return "Follow-up scheduled";
    case "escalate":        return "Lead escalated";
    default:                return "Done";
  }
}
