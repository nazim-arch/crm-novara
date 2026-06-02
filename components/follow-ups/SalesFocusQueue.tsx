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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Phone, MessageCircle, Mail, CheckCircle, XCircle, RotateCcw, Calendar,
  ChevronLeft, ChevronRight, ExternalLink, Loader2, User, MapPin, Home,
  TrendingUp, Tag, Clock, AlertTriangle, Flame, Target, Zap,
  CheckCircle2, PhoneOff, Coffee, BadgeCheck, List, CalendarPlus, MoreHorizontal,
} from "lucide-react";
import { getFollowUpCardTheme, getDueLabel } from "./focus-queue-theme";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeadNote {
  id: string;
  content: string;
  created_at: string;
  created_by: { name: string };
}

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
  alternate_requirement: string | null;
  assigned_to: { id: string; name: string };
  _count?: { followups: number };
  notes?: LeadNote[];
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

interface QueueData {
  queue: FocusItem[];
  callback_pending: FocusItem[];
  completed_today: FocusItem[];
  stats: { overdue: number; due_today: number; callback_today: number; completed_today: number; hot_active: number };
}

type ModalType =
  | "contacted" | "no_response" | "callback_today" | "schedule_next"
  | "update_stage" | "mark_lost" | "mark_won" | "site_visit_done"
  | "update_notes" | "log_attempt";

interface ModalState { type: ModalType; item: FocusItem }

const FOLLOW_UP_TYPES = ["Call", "Email", "WhatsApp", "Visit", "Meeting", "Activity", "Internal"] as const;
const PIPELINE_STAGES = ["New", "Prospect", "SiteVisitCompleted", "Negotiation", "Won", "Lost", "InvalidLead", "OnHold", "Recycle"] as const;
const OUTCOMES = ["Interested", "Not Interested", "Call Back", "Thinking", "Sent Details", "Site Visit Scheduled", "Site Visit Done", "Negotiating", "Deal Done", "Other"];
const TEMPERATURES = ["Hot", "Warm", "Cold", "FollowUpLater"];
const LOST_REASONS = ["Budget Mismatch", "Location Mismatch", "No Response", "Went with Competitor", "Not Looking Anymore", "Property Not Available", "Other"];
const CALLBACK_QUICK = [
  { label: "30m", mins: 30 }, { label: "1h", mins: 60 }, { label: "2h", mins: 120 },
  { label: "4h", mins: 240 }, { label: "EOD", mins: -1 },
];

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

function inrFmt(v: number) {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000) return `₹${(v / 100_000).toFixed(1)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

function TempBadge({ temp }: { temp: string }) {
  const map: Record<string, string> = {
    Hot: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    Warm: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    Cold: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    FollowUpLater: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${map[temp] ?? "bg-muted text-muted-foreground"}`}>
      {temp === "Hot" && <Flame className="h-3 w-3" />}
      {temp}
    </span>
  );
}

function StageBadge({ stage }: { stage: string }) {
  return <span className="text-[10px] font-medium text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded">{stage}</span>;
}

function StatPill({ label, value, cls, Icon }: { label: string; value: number; cls?: string; Icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-2 px-3.5 py-2 rounded-full border bg-card whitespace-nowrap shrink-0 select-none shadow-sm">
      <Icon className={`h-3.5 w-3.5 ${cls ?? "text-muted-foreground"}`} />
      <span className={`text-sm font-bold tabular-nums ${cls ?? "text-foreground"}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ── Schedule Next Dialog ───────────────────────────────────────────────────────

function ScheduleNextDialog({
  item,
  onScheduled,
  onSkip,
}: {
  item: FocusItem;
  onScheduled: () => void;
  onSkip: () => void;
}) {
  const [date, setDate] = useState("");
  const [type, setType] = useState("Call");
  const [submitting, setSubmitting] = useState(false);

  function quickDate(daysFromNow: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString().slice(0, 10);
  }

  async function schedule() {
    if (!date || !item.lead_id) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: item.lead_id,
          type,
          scheduled_at: date + "T09:00:00",
          assigned_to_id: item.assigned_to?.id,
        }),
      });
      if (!res.ok) { toast.error("Failed to schedule follow-up"); return; }
      await fetch(`/api/leads/${item.lead_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next_followup_date: date + "T09:00:00", followup_type: type }),
      });
      toast.success("Next follow-up scheduled");
      onScheduled();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onSkip(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-primary" />
            Schedule Next Follow-up?
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <p className="text-sm text-muted-foreground">
            Action logged for <span className="font-medium text-foreground">{item.lead?.full_name}</span>. When is the next follow-up?
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {[{ label: "Tomorrow", days: 1 }, { label: "+3 Days", days: 3 }, { label: "+1 Week", days: 7 }].map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => setDate(quickDate(q.days))}
                className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${date === quickDate(q.days) ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:border-muted-foreground"}`}
              >
                {q.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => v && setType(v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FOLLOW_UP_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={onSkip} disabled={submitting}>
              Skip for Now
            </Button>
            <Button size="sm" className="flex-1 text-xs" onClick={schedule} disabled={!date || submitting}>
              {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Schedule
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Action Modal Wrapper (Sheet on mobile, Dialog on desktop) ─────────────────

function ActionModal({
  open,
  onOpenChange,
  title,
  isMobile,
  children,
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
          <div className="px-4 pt-3 pb-8 overflow-y-auto">
            {children}
          </div>
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

// ── Focus Card ────────────────────────────────────────────────────────────────

function FocusCard({
  item, idx, total,
  onAction, onLogAttempt,
}: {
  item: FocusItem; idx: number; total: number;
  onAction: (type: ModalType) => void;
  onLogAttempt: (channel: "Call" | "WhatsApp" | "Email") => Promise<void>;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const lead = item.lead;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const isOverdue = new Date(item.scheduled_at) < todayStart;
  const daysOverdue = differenceInCalendarDays(todayStart, new Date(item.scheduled_at));
  const theme = getFollowUpCardTheme(
    lead?.temperature, isOverdue, daysOverdue,
    item.no_response_count, lead?.potential_lead_value ?? null, false,
  );
  const due = getDueLabel(item.scheduled_at, item.callback_at);
  const waLink = `https://wa.me/${(lead?.whatsapp ?? lead?.phone ?? "").replace(/\D/g, "")}`;

  function handleAction(type: ModalType) {
    setMoreOpen(false);
    onAction(type);
  }

  return (
    <div className={`rounded-2xl border-2 ${theme.border} ${theme.card} overflow-hidden shadow-md`}>
      {/* ── Full-bleed gradient header ── */}
      <div className={`${theme.headerGradient} px-4 pt-4 pb-3`}>
        {/* Top row: priority label + counter */}
        <div className="flex items-center justify-between mb-2.5">
          <span className={`text-[10px] font-bold uppercase tracking-widest ${theme.badgeBg} ${theme.badgeText} px-2.5 py-0.5 rounded-full`}>
            {theme.priorityLabel}
          </span>
          <span className="text-[11px] text-foreground/50 font-medium tabular-nums">{idx + 1}/{total}</span>
        </div>
        {/* Lead name + badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link href={`/leads/${lead?.id}`} target="_blank" className="hover:underline focus-visible:underline">
              <h3 className="text-xl font-semibold tracking-tight leading-tight">{lead?.full_name ?? "—"}</h3>
            </Link>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="text-[11px] font-mono text-foreground/50">{lead?.lead_number}</span>
              {lead?.status && <StageBadge stage={lead.status} />}
              {lead?._count && lead._count.followups > 0 && (
                <span className="text-[10px] text-foreground/40 bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">
                  {lead._count.followups} FUs
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 mt-0.5">
            {lead && <TempBadge temp={lead.temperature} />}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* ── Urgency badges ── */}
        {theme.urgencyBadges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {theme.urgencyBadges.map((b) => (
              <span key={b.text} className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium ${b.cls}`}>{b.text}</span>
            ))}
          </div>
        )}

        {/* ── Due time + Contacts row ── */}
        <div className="flex items-center gap-2">
          <div className={`flex-1 flex items-center gap-2 rounded-xl border px-3 py-2 ${due.isUrgent ? "bg-destructive/5 border-destructive/20" : "bg-muted/40 border-border/50"}`}>
            <Clock className={`h-3.5 w-3.5 shrink-0 ${due.isUrgent ? "text-destructive" : "text-muted-foreground"}`} />
            <span className={`text-xs font-semibold ${due.cls}`}>{due.label}</span>
          </div>
          <a
            href={`tel:${lead?.phone ?? ""}`}
            onClick={() => void onLogAttempt("Call")}
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-green-600 hover:bg-green-700 text-white transition-colors shadow-sm"
            aria-label="Call"
          >
            <Phone className="h-4 w-4" />
          </a>
          {(lead?.whatsapp ?? lead?.phone) && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void onLogAttempt("WhatsApp")}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white transition-colors shadow-sm"
              aria-label="WhatsApp"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          )}
          {lead?.email && (
            <a
              href={`mailto:${lead.email}`}
              onClick={() => void onLogAttempt("Email")}
              className="flex items-center justify-center w-10 h-10 rounded-xl border border-border bg-background hover:bg-muted text-foreground/70 transition-colors"
              aria-label="Email"
            >
              <Mail className="h-4 w-4" />
            </a>
          )}
        </div>

        {/* Phone number (visible for quick copy) */}
        {lead?.phone && (
          <p className="text-xs text-muted-foreground font-mono text-center -mt-1 tracking-wide">{lead.phone}</p>
        )}

        {/* ── Lead Context ── */}
        {lead && (
          <div className="rounded-xl bg-muted/30 border border-border/60 p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Lead Context</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {(lead.budget_min || lead.budget_max) && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <TrendingUp className="h-3 w-3 shrink-0" />
                  <span className="font-medium text-foreground">
                    {lead.budget_min && lead.budget_max ? `${inrFmt(lead.budget_min)} – ${inrFmt(lead.budget_max)}` : inrFmt((lead.budget_min ?? lead.budget_max)!)}
                  </span>
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
                  <span className="font-semibold text-foreground">{inrFmt(lead.potential_lead_value)}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Tag className="h-3 w-3 shrink-0" />
                <span>{lead.lead_source}</span>
              </div>
              {item.opportunity && (
                <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
                  <Target className="h-3 w-3 shrink-0" />
                  <span className="font-medium text-foreground truncate">{item.opportunity.name}</span>
                  <span className="font-mono text-[10px] shrink-0">{item.opportunity.opp_number}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Requirement Notes ── */}
        {lead?.alternate_requirement && (
          <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/50 p-3 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-300">Requirement Notes</p>
            <p className="text-xs text-foreground leading-relaxed whitespace-pre-line line-clamp-4">{lead.alternate_requirement}</p>
          </div>
        )}

        {/* ── Notes History ── */}
        {lead?.notes && lead.notes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Notes History ({lead.notes.length})
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-hide">
              {lead.notes.map((note) => (
                <div key={note.id} className="rounded-lg bg-muted/40 border border-border/60 p-2.5">
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-line">{note.content}</p>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    <span className="font-medium">{note.created_by.name}</span>
                    {" · "}
                    {new Date(note.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Last Interaction ── */}
        {(lead?.outcome || lead?.last_contact_date || item.notes) && (
          <div className="rounded-xl bg-muted/30 border border-border/60 p-3 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Last Interaction</p>
            {lead?.last_contact_date && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0" />
                {new Date(lead.last_contact_date).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            {(lead?.outcome || item.notes) && (
              <p className="text-xs text-foreground leading-relaxed line-clamp-2">{item.notes ?? lead?.outcome}</p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Assigned to <span className="font-medium text-foreground">{lead?.assigned_to?.name ?? item.assigned_to?.name ?? "—"}</span>
            </p>
          </div>
        )}

        {/* ── Actions — Desktop (all buttons visible) ── */}
        <div className="hidden sm:block space-y-2 pt-2 border-t">
          {/* Primary */}
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white h-10 text-sm font-semibold" onClick={() => onAction("contacted")}>
              <CheckCircle className="h-4 w-4" />Contacted
            </Button>
            <Button size="sm" className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white h-10 text-sm font-semibold" onClick={() => onAction("no_response")}>
              <PhoneOff className="h-4 w-4" />No Response
            </Button>
          </div>
          {/* Secondary */}
          <div className="grid grid-cols-3 gap-1.5">
            <Button size="sm" variant="outline" className="gap-1 text-violet-700 border-violet-200 hover:bg-violet-50 text-xs h-9" onClick={() => onAction("callback_today")}>
              <Coffee className="h-3.5 w-3.5" />Callback
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-blue-700 border-blue-200 hover:bg-blue-50 text-xs h-9" onClick={() => onAction("schedule_next")}>
              <Calendar className="h-3.5 w-3.5" />Schedule
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-indigo-700 border-indigo-200 hover:bg-indigo-50 text-xs h-9" onClick={() => onAction("update_stage")}>
              <Zap className="h-3.5 w-3.5" />Stage
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" variant="outline" className="gap-1 text-purple-700 border-purple-200 hover:bg-purple-50 text-xs h-9" onClick={() => onAction("site_visit_done")}>
              <BadgeCheck className="h-3.5 w-3.5" />Site Visit Done
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-muted-foreground text-xs h-9" onClick={() => onAction("update_notes")}>
              Update Notes
            </Button>
          </div>
          {/* Danger row */}
          <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-dashed">
            <Button size="sm" variant="outline" className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10 text-xs h-9" onClick={() => onAction("mark_lost")}>
              <XCircle className="h-3.5 w-3.5" />Mark Lost
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50 text-xs h-9 font-semibold" onClick={() => onAction("mark_won")}>
              <Flame className="h-3.5 w-3.5" />Mark Won
            </Button>
          </div>
          {lead && (
            <Link href={`/leads/${lead.id}`} target="_blank" className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1 transition-colors">
              <ExternalLink className="h-3 w-3" />Open Full Lead
            </Link>
          )}
        </div>

        {/* ── Actions — Mobile (2 primary + More drawer) ── */}
        <div className="sm:hidden pt-2 border-t space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white h-11 text-sm font-semibold" onClick={() => onAction("contacted")}>
              <CheckCircle className="h-4 w-4" />Contacted
            </Button>
            <Button size="sm" className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white h-11 text-sm font-semibold" onClick={() => onAction("no_response")}>
              <PhoneOff className="h-4 w-4" />No Response
            </Button>
          </div>
          <div className="flex gap-2">
            {lead && (
              <Link href={`/leads/${lead.id}`} target="_blank" className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-border/60 transition-colors flex-1">
                <ExternalLink className="h-3 w-3" />Full Lead
              </Link>
            )}
            <Button
              size="sm"
              variant="outline"
              className="flex-1 gap-1.5 text-xs h-9 text-foreground"
              onClick={() => setMoreOpen(true)}
            >
              <MoreHorizontal className="h-4 w-4" />More Actions
            </Button>
          </div>
        </div>
      </div>

      {/* ── Mobile More Actions Drawer ── */}
      <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-base">More Actions</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-8 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 text-violet-700 border-violet-200 hover:bg-violet-50 text-xs h-11" onClick={() => handleAction("callback_today")}>
                <Coffee className="h-4 w-4" />Callback Today
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50 text-xs h-11" onClick={() => handleAction("schedule_next")}>
                <Calendar className="h-4 w-4" />Schedule Next
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-indigo-700 border-indigo-200 hover:bg-indigo-50 text-xs h-11" onClick={() => handleAction("update_stage")}>
                <Zap className="h-4 w-4" />Update Stage
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-purple-700 border-purple-200 hover:bg-purple-50 text-xs h-11" onClick={() => handleAction("site_visit_done")}>
                <BadgeCheck className="h-4 w-4" />Site Visit Done
              </Button>
            </div>
            <Button size="sm" variant="outline" className="w-full gap-1.5 text-muted-foreground text-xs h-9" onClick={() => handleAction("update_notes")}>
              Update Notes
            </Button>
            <div className="pt-1 border-t border-dashed space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Terminal Actions</p>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 text-xs h-11" onClick={() => handleAction("mark_lost")}>
                  <XCircle className="h-4 w-4" />Mark Lost
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 text-xs h-11 font-semibold" onClick={() => handleAction("mark_won")}>
                  <Flame className="h-4 w-4" />Mark Won
                </Button>
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

// ── Completed Row ─────────────────────────────────────────────────────────────

function CompletedRow({ item }: { item: FocusItem }) {
  const lead = item.lead;
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0">
      <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center shrink-0">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      </div>
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
  const isPast = item.callback_at && new Date(item.callback_at) <= new Date();
  return (
    <div className={`flex items-start gap-3 py-3 border-b last:border-0 ${isPast ? "bg-violet-50/40 dark:bg-violet-950/10 -mx-3 px-3 rounded" : ""}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isPast ? "bg-violet-100 dark:bg-violet-900/30" : "bg-muted"}`}>
        <RotateCcw className={`h-4 w-4 ${isPast ? "text-violet-600" : "text-muted-foreground"}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/leads/${lead?.id}`} className="font-medium text-sm hover:underline">{lead?.full_name ?? "—"}</Link>
          {lead && <TempBadge temp={lead.temperature} />}
          {isPast && <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded-full">DUE NOW</span>}
        </div>
        {item.callback_at && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Callback at {new Date(item.callback_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
        {item.notes && <p className="text-xs text-muted-foreground italic line-clamp-1">"{item.notes}"</p>}
      </div>
    </div>
  );
}

// ── Modal helpers ─────────────────────────────────────────────────────────────

function getModalTitle(type: ModalType | null): string {
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

function needsSchedulePrompt(type: ModalType, form: Record<string, string>): boolean {
  if (type === "contacted") return !form.next_date;
  if (type === "update_stage") return true;
  if (type === "site_visit_done") return !form.next_date;
  return false;
}

// ── Modal Form Content ────────────────────────────────────────────────────────

function ModalFormContent({
  modal, form, f, subAction, setSubAction, submitting, submitModal, onClose,
}: {
  modal: ModalState;
  form: Record<string, string>;
  f: (key: string, val: string) => void;
  subAction: "callback_today" | "schedule_next" | "mark_unreachable";
  setSubAction: (s: "callback_today" | "schedule_next" | "mark_unreachable") => void;
  submitting: boolean;
  submitModal: () => void;
  onClose: () => void;
}) {
  const { type, item } = modal;
  return (
    <div className="space-y-3 pt-1">
      {item.lead && (
        <p className="text-sm text-muted-foreground">
          Lead: <span className="font-medium text-foreground">{item.lead.full_name} ({item.lead.lead_number})</span>
        </p>
      )}

      {/* ── Contacted ── */}
      {type === "contacted" && (
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
              <Input type="date" value={form.next_date ?? ""} onChange={(e) => f("next_date", e.target.value)} className="h-8 text-xs" />
              <Input type="time" value={form.next_time ?? ""} onChange={(e) => f("next_time", e.target.value)} className="h-8 text-xs" />
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
      {type === "no_response" && (
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
                  className={`px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors ${subAction === sa ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>
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
                    className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${form.callback_time === quickCallbackTime(q.mins) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>
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
      {type === "callback_today" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Callback Time *</Label>
            <div className="flex gap-1.5 flex-wrap">
              {CALLBACK_QUICK.map((q) => (
                <button key={q.label} type="button"
                  onClick={() => f("callback_time", quickCallbackTime(q.mins))}
                  className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${form.callback_time === quickCallbackTime(q.mins) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>
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
      {type === "schedule_next" && (
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
      {type === "update_stage" && (
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
      {type === "mark_lost" && (
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
      {type === "mark_won" && (
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
      {type === "site_visit_done" && (
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
      {type === "update_notes" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Notes *</Label>
          <Textarea value={form.notes ?? ""} onChange={(e) => f("notes", e.target.value)} placeholder="Add notes to this follow-up and lead…" className="text-xs resize-none h-24" />
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" className="flex-1" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button size="sm" className="flex-1" onClick={submitModal} disabled={submitting}>
          {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Confirm
        </Button>
      </div>
    </div>
  );
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
  const isMobile = useMediaQuery("(max-width: 639px)");

  const [data, setData] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cardIdx, setCardIdx] = useState(0);
  const [activeTab, setActiveTab] = useState("focus");
  const [agentFilter, setAgentFilter] = useState<string>(isManagerOrAdmin ? "mine" : currentUserId);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [subAction, setSubAction] = useState<"callback_today" | "schedule_next" | "mark_unreachable">("callback_today");
  const [schedulePromptItem, setSchedulePromptItem] = useState<FocusItem | null>(null);
  const [slideDir, setSlideDir] = useState<"left" | "right" | null>(null);

  const swipeStartX = useRef<number | null>(null);
  const modalRef = useRef(modal);
  modalRef.current = modal;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (isManagerOrAdmin) params.set("agent", agentFilter);
    const res = await fetch(`/api/follow-ups/focus-queue?${params}`);
    if (res.ok) {
      const json: QueueData = await res.json();
      setData(json);
      setCardIdx(0);
    }
    setLoading(false);
  }, [agentFilter, isManagerOrAdmin]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // Reset slide direction after animation
  useEffect(() => {
    if (!slideDir) return;
    const t = setTimeout(() => setSlideDir(null), 300);
    return () => clearTimeout(t);
  }, [slideDir, cardIdx]);

  const queue = data?.queue ?? [];

  function goNext() {
    if (cardIdx >= queue.length - 1) return;
    setSlideDir("left");
    setCardIdx((i) => i + 1);
  }
  function goPrev() {
    if (cardIdx <= 0) return;
    setSlideDir("right");
    setCardIdx((i) => i - 1);
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (modalRef.current || schedulePromptItem) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === "n") goNext();
      if (e.key === "ArrowLeft" || e.key === "p") goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.queue, schedulePromptItem, cardIdx]);

  function openModal(type: ModalType) {
    const item = queue[cardIdx];
    if (!item) return;
    setForm({});
    setSubAction("callback_today");
    setModal({ type, item });
  }

  async function logAttempt(channel: "Call" | "WhatsApp" | "Email") {
    const item = queue[cardIdx];
    if (!item) return;
    await fetch(`/api/follow-ups/${item.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "log_attempt", channel }),
    });
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        queue: prev.queue.map((q) => q.id === item.id ? { ...q, attempt_count: q.attempt_count + 1 } : q),
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
        toast.error((err as { error?: string }).error ?? "Action failed");
        return;
      }
      const result = await res.json();
      const resultAction = result.action as string;

      setModal(null);

      if (resultAction === "callback_today") {
        setData((prev) => {
          if (!prev) return prev;
          const updated = prev.queue.map((q) => q.id === item.id ? { ...q, callback_at: result.data.callback_at } : q);
          const callbackItem = updated.find((q) => q.id === item.id);
          return {
            ...prev,
            queue: prev.queue.filter((q) => q.id !== item.id),
            callback_pending: callbackItem
              ? [...prev.callback_pending, callbackItem].sort((a, b) => new Date(a.callback_at!).getTime() - new Date(b.callback_at!).getTime())
              : prev.callback_pending,
          };
        });
        setCardIdx((i) => Math.max(0, Math.min(i, (data?.queue.length ?? 1) - 2)));
        toast.success("Parked for callback today");
      } else if (resultAction === "notes_updated") {
        setData((prev) => {
          if (!prev) return prev;
          return { ...prev, queue: prev.queue.map((q) => q.id === item.id ? { ...q, notes: result.data.notes } : q) };
        });
        toast.success("Notes updated");
      } else {
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
        setCardIdx((i) => Math.max(0, Math.min(i, (data?.queue.length ?? 1) - 2)));
        toast.success("Done");
        if (needsSchedulePrompt(type, form)) {
          setSchedulePromptItem(item);
        }
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const f = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));
  const stats = data?.stats;
  const currentItem = queue[cardIdx];

  return (
    <div className="space-y-4 mt-2">
      {/* Schedule Next dialog */}
      {schedulePromptItem && (
        <ScheduleNextDialog
          item={schedulePromptItem}
          onScheduled={() => { setSchedulePromptItem(null); void fetchData(); }}
          onSkip={() => setSchedulePromptItem(null)}
        />
      )}

      {/* Agent Selector */}
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
        </div>
      )}

      {/* ── Stats Pills ── */}
      {stats && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide snap-x">
          <StatPill label="Overdue" value={stats.overdue} cls="text-destructive" Icon={AlertTriangle} />
          <StatPill label="Due Today" value={stats.due_today} cls="text-orange-600" Icon={Clock} />
          <StatPill label="Callbacks" value={stats.callback_today} cls="text-violet-600" Icon={RotateCcw} />
          <StatPill label="Completed" value={stats.completed_today} cls="text-emerald-600" Icon={CheckCircle2} />
          <StatPill label="Hot Active" value={stats.hot_active} cls="text-red-600" Icon={Flame} />
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="focus" className="gap-1 text-xs sm:text-sm">
            <Zap className="h-3.5 w-3.5" />Focus Queue
            {queue.length > 0 && (
              <span className="ml-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 leading-5">{queue.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="callback" className="gap-1 text-xs sm:text-sm">
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Callback Today</span>
            <span className="sm:hidden">Callbacks</span>
            {(data?.callback_pending.length ?? 0) > 0 && <span className="text-[10px] opacity-70 ml-0.5">({data?.callback_pending.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-1 text-xs sm:text-sm">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Completed Today</span>
            <span className="sm:hidden">Completed</span>
            {(data?.completed_today.length ?? 0) > 0 && <span className="text-[10px] opacity-70 ml-0.5">({data?.completed_today.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-1 text-xs sm:text-sm">
            <List className="h-3.5 w-3.5" />All
          </TabsTrigger>
        </TabsList>

        {/* ── Focus Queue Tab ── */}
        <TabsContent value="focus" className="mt-3">
          {loading ? (
            <div className="max-w-xl mx-auto space-y-3">
              <div className="h-[90px] rounded-2xl border-2 animate-pulse bg-muted/60" />
              <div className="h-10 rounded-xl animate-pulse bg-muted/40" />
              <div className="h-28 rounded-xl animate-pulse bg-muted/40" />
              <div className="h-16 rounded-xl animate-pulse bg-muted/40" />
            </div>
          ) : queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8 text-emerald-500" />
              </div>
              <p className="text-lg font-semibold">You're all caught up!</p>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-xs">No overdue or due follow-ups right now. New cards appear when follow-ups become due.</p>
              <Button variant="outline" size="sm" className="mt-5 gap-1.5" onClick={fetchData}>
                <RotateCcw className="h-3.5 w-3.5" />Refresh
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Navigation bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-full shadow-sm" disabled={cardIdx === 0} onClick={goPrev}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {/* Progress pill */}
                  <div className="flex items-center gap-2 bg-muted/60 rounded-full px-3 py-1.5">
                    <div className="w-16 h-1 bg-muted-foreground/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${((cardIdx + 1) / queue.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">{cardIdx + 1}/{queue.length}</span>
                  </div>
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-full shadow-sm" disabled={cardIdx >= queue.length - 1} onClick={goNext}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={fetchData}>
                    <RotateCcw className="h-3 w-3 mr-1" />Refresh
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground hidden sm:block">← → or swipe</p>
              </div>

              {/* Card with swipe + slide animation */}
              {currentItem && (
                <div
                  className="max-w-xl mx-auto touch-pan-y"
                  onPointerDown={(e) => { swipeStartX.current = e.clientX; }}
                  onPointerUp={(e) => {
                    if (swipeStartX.current === null) return;
                    const delta = e.clientX - swipeStartX.current;
                    swipeStartX.current = null;
                    if (Math.abs(delta) < 60) return;
                    if (delta < 0) goNext();
                    else goPrev();
                  }}
                  onPointerCancel={() => { swipeStartX.current = null; }}
                >
                  <div
                    key={cardIdx}
                    className={slideDir === "left" ? "animate-slide-from-right" : slideDir === "right" ? "animate-slide-from-left" : ""}
                  >
                    <FocusCard item={currentItem} idx={cardIdx} total={queue.length} onAction={openModal} onLogAttempt={logAttempt} />
                  </div>
                </div>
              )}

              {/* Queue preview list */}
              {queue.length > 1 && (
                <div className="max-w-xl mx-auto rounded-xl border bg-card overflow-hidden divide-y max-h-48 overflow-y-auto scrollbar-hide">
                  {queue.map((item, i) => {
                    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
                    const isOverdue = new Date(item.scheduled_at) < todayStart;
                    const tempDot = item.lead?.temperature === "Hot" ? "bg-red-500" : item.lead?.temperature === "Warm" ? "bg-amber-400" : item.lead?.temperature === "Cold" ? "bg-blue-400" : "bg-purple-400";
                    return (
                      <button key={item.id} onClick={() => { setSlideDir(i > cardIdx ? "left" : "right"); setCardIdx(i); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors border-l-2 ${i === cardIdx ? "bg-muted/40 border-primary" : "border-transparent"}`}>
                        <div className={`w-2 h-2 rounded-full shrink-0 ${tempDot}`} />
                        <span className={`truncate flex-1 text-xs ${i === cardIdx ? "font-semibold" : ""}`}>{item.lead?.full_name ?? "—"}</span>
                        {isOverdue && <span className="text-destructive text-[10px] font-bold shrink-0">OVERDUE</span>}
                        <span className="text-muted-foreground text-[10px] shrink-0">{item.type}</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
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
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                <Coffee className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="font-medium">No callbacks parked for today</p>
              <p className="text-sm text-muted-foreground mt-1">Leads marked for callback will appear here.</p>
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-3 divide-y">
              {data?.callback_pending.map((item) => <CallbackRow key={item.id} item={item} />)}
            </div>
          )}
        </TabsContent>

        {/* ── Completed Today ── */}
        <TabsContent value="completed" className="mt-3">
          {(data?.completed_today.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                <CheckCircle2 className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="font-medium">No follow-ups completed today yet</p>
              <p className="text-sm text-muted-foreground mt-1">Completed follow-ups appear here after you action them.</p>
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-3 divide-y">
              {data?.completed_today.map((item) => <CompletedRow key={item.id} item={item} />)}
            </div>
          )}
        </TabsContent>

        {/* ── All Follow-ups ── */}
        <TabsContent value="all" className="mt-3">
          <div className="rounded-xl border bg-card divide-y max-h-96 overflow-y-auto scrollbar-hide">
            {[...(data?.queue ?? []), ...(data?.callback_pending ?? [])].length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">No active follow-ups</p>
            ) : (
              [...(data?.queue ?? []), ...(data?.callback_pending ?? [])].map((item) => {
                const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
                const isOverdue = !item.callback_at && new Date(item.scheduled_at) < todayStart;
                const tempDot = item.lead?.temperature === "Hot" ? "bg-red-500" : item.lead?.temperature === "Warm" ? "bg-amber-400" : item.lead?.temperature === "Cold" ? "bg-blue-400" : "bg-purple-400";
                return (
                  <div key={item.id} className={`flex items-center gap-3 px-3 py-2.5 ${isOverdue ? "bg-red-50/40 dark:bg-red-950/10" : ""}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${tempDot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Link href={`/leads/${item.lead?.id}`} className="font-medium hover:underline text-sm">{item.lead?.full_name ?? "—"}</Link>
                        {isOverdue && <span className="text-[10px] text-destructive font-bold">OVERDUE</span>}
                        {item.callback_at && <span className="text-[10px] text-violet-600 font-medium">CALLBACK</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.type} · {new Date(item.callback_at ?? item.scheduled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">{item.assigned_to?.name}</div>
                  </div>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Action Modal (Sheet on mobile, Dialog on desktop) ── */}
      <ActionModal
        open={!!modal}
        onOpenChange={(o) => { if (!o) setModal(null); }}
        title={getModalTitle(modal?.type ?? null)}
        isMobile={isMobile}
      >
        {modal && (
          <ModalFormContent
            modal={modal}
            form={form}
            f={f}
            subAction={subAction}
            setSubAction={setSubAction}
            submitting={submitting}
            submitModal={submitModal}
            onClose={() => setModal(null)}
          />
        )}
      </ActionModal>
    </div>
  );
}
