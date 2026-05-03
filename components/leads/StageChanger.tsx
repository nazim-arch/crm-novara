"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LeadStatusBadge, ActivityStageBadge } from "@/components/shared/LeadStatusBadge";
import { Loader2 } from "lucide-react";

const PIPELINE_STAGES = [
  { value: "New", label: "New" },
  { value: "Prospect", label: "Prospect" },
  { value: "SiteVisitCompleted", label: "Site Visit Completed" },
  { value: "Negotiation", label: "Negotiation" },
  { value: "Won", label: "Won" },
  { value: "Lost", label: "Lost" },
  { value: "InvalidLead", label: "Invalid Lead" },
  { value: "OnHold", label: "On Hold" },
  { value: "Recycle", label: "Recycle" },
] as const;

const ACTIVITY_STAGES = [
  { value: "New", label: "New" },
  { value: "NoResponse", label: "No Response" },
  { value: "Busy", label: "Busy" },
  { value: "Unreachable", label: "Unreachable" },
  { value: "Prospect", label: "Prospect" },
  { value: "CallBack", label: "Call Back" },
  { value: "NotInterested", label: "Not Interested" },
  { value: "Junk", label: "Junk" },
] as const;

const LOST_REASONS = [
  { value: "Budget", label: "Budget" },
  { value: "Location", label: "Location" },
  { value: "Configuration", label: "Configuration" },
  { value: "Timing", label: "Timing" },
  { value: "NotSerious", label: "Not Serious" },
  { value: "Financing", label: "Financing" },
  { value: "PurchasedElsewhere", label: "Purchased Elsewhere" },
  { value: "Other", label: "Other" },
] as const;

type DialogMode = "lost" | "won" | "invalidLead" | null;

interface StageChangerProps {
  leadId: string;
  currentStage: string;
  currentActivityStage?: string;
}

export function StageChanger({ leadId, currentStage, currentActivityStage = "New" }: StageChangerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Pending changes
  const [pendingPipeline, setPendingPipeline] = useState<string | null>(null);
  const [pendingActivity, setPendingActivity] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);

  // Lost fields
  const [lostReason, setLostReason] = useState("");
  const [lostNotes, setLostNotes] = useState("");

  // Won fields
  const [settlementValue, setSettlementValue] = useState("");
  const [dealCommissionPercent, setDealCommissionPercent] = useState("");

  // Invalid Lead note
  const [invalidNotes, setInvalidNotes] = useState("");

  const reset = () => {
    setPendingPipeline(null);
    setPendingActivity(null);
    setDialogMode(null);
    setLostReason("");
    setLostNotes("");
    setSettlementValue("");
    setDealCommissionPercent("");
    setInvalidNotes("");
  };

  const submitChange = async (payload: Record<string, unknown>) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to update stage");
        return;
      }
      toast.success("Stage updated");
      reset();
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  // Pipeline stage change handler
  const handlePipelineChange = (stage: string) => {
    if (!stage || stage === currentStage) return;
    if (stage === "Lost") {
      setPendingPipeline(stage);
      setDialogMode("lost");
    } else if (stage === "Won") {
      setPendingPipeline(stage);
      setDialogMode("won");
    } else if (stage === "InvalidLead") {
      setPendingPipeline(stage);
      setDialogMode("invalidLead");
    } else {
      submitChange({ to_stage: stage });
    }
  };

  // Activity stage change handler
  const handleActivityChange = (stage: string) => {
    if (!stage || stage === currentActivityStage) return;
    if (stage === "NotInterested") {
      setPendingPipeline("Lost");
      setPendingActivity(stage);
      setDialogMode("lost");
    } else if (stage === "Junk") {
      setPendingPipeline("InvalidLead");
      setPendingActivity(stage);
      setDialogMode("invalidLead");
    } else {
      submitChange({ activity_stage: stage });
    }
  };

  const confirmLost = async () => {
    if (!lostReason) { toast.error("Please select a lost reason"); return; }
    if (!lostNotes.trim()) { toast.error("Please add a note explaining why the lead was lost"); return; }
    await submitChange({
      to_stage: "Lost",
      ...(pendingActivity && { activity_stage: pendingActivity }),
      lost_reason: lostReason,
      lost_notes: lostNotes,
    });
  };

  const confirmWon = async () => {
    if (!settlementValue || Number(settlementValue) <= 0) { toast.error("Please enter the settlement value"); return; }
    if (dealCommissionPercent === "" || Number(dealCommissionPercent) < 0) { toast.error("Please enter the commission %"); return; }
    await submitChange({
      to_stage: "Won",
      settlement_value: Number(settlementValue),
      deal_commission_percent: Number(dealCommissionPercent),
    });
  };

  const confirmInvalidLead = async () => {
    await submitChange({
      to_stage: "InvalidLead",
      ...(pendingActivity && { activity_stage: pendingActivity }),
      ...(invalidNotes.trim() && { notes: invalidNotes }),
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        {/* Pipeline Stage */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Pipeline Stage</p>
          <div className="flex items-center gap-2">
            <LeadStatusBadge status={currentStage} />
            <Select value={currentStage} onValueChange={handlePipelineChange}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PIPELINE_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Activity Stage */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Activity Stage</p>
          <div className="flex items-center gap-2">
            <ActivityStageBadge stage={currentActivityStage} />
            <Select value={currentActivityStage} onValueChange={handleActivityChange}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Lost Dialog */}
      <Dialog open={dialogMode === "lost"} onOpenChange={reset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Lead as Lost</DialogTitle>
            <DialogDescription>
              {pendingActivity === "NotInterested"
                ? "Activity marked as Not Interested — this will also move the pipeline to Lost."
                : "Moving lead to Lost stage."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Lost Reason <span className="text-destructive">*</span></Label>
              <Select value={lostReason} onValueChange={(v) => setLostReason(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {LOST_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Why was this lead lost? <span className="text-destructive">*</span></Label>
              <Textarea
                value={lostNotes}
                onChange={(e) => setLostNotes(e.target.value)}
                placeholder="Add context — e.g. client chose competitor, budget mismatch..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={reset}>Cancel</Button>
            <Button variant="destructive" onClick={confirmLost} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Won Dialog */}
      <Dialog open={dialogMode === "won"} onOpenChange={reset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deal Won</DialogTitle>
            <DialogDescription>Enter the deal details to mark this lead as Won.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="settlement_value">
                Settlement Value (₹) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="settlement_value"
                type="number"
                placeholder="e.g. 7500000"
                value={settlementValue}
                onChange={(e) => setSettlementValue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="commission_pct">
                Commission % <span className="text-destructive">*</span>
              </Label>
              <Input
                id="commission_pct"
                type="number"
                step="0.01"
                placeholder="e.g. 2"
                value={dealCommissionPercent}
                onChange={(e) => setDealCommissionPercent(e.target.value)}
              />
              {settlementValue && dealCommissionPercent && (
                <p className="text-xs text-muted-foreground">
                  Commission:{" "}
                  <strong>
                    ₹{((Number(settlementValue) * Number(dealCommissionPercent)) / 100).toLocaleString("en-IN")}
                  </strong>
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={reset}>Cancel</Button>
            <Button onClick={confirmWon} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Won
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invalid Lead Dialog */}
      <Dialog open={dialogMode === "invalidLead"} onOpenChange={reset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Invalid Lead</DialogTitle>
            <DialogDescription>
              {pendingActivity === "Junk"
                ? "Activity marked as Junk — this will also move the pipeline to Invalid Lead."
                : "Moving lead to Invalid Lead stage."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              value={invalidNotes}
              onChange={(e) => setInvalidNotes(e.target.value)}
              placeholder="Reason for marking as invalid..."
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={reset}>Cancel</Button>
            <Button onClick={confirmInvalidLead} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
