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
import { Textarea } from "@/components/ui/textarea";
import { LeadStatusBadge } from "@/components/shared/LeadStatusBadge";
import { Loader2 } from "lucide-react";

const STAGES = [
  "New", "Contacted", "Qualified", "Requirement",
  "OpportunityTagged", "Visit", "FollowUp", "Negotiation",
  "Won", "Lost", "OnHold", "Recycle",
] as const;

const LOST_REASONS = [
  "Budget", "Location", "Configuration", "Timing",
  "NotSerious", "Financing", "PurchasedElsewhere", "Other",
] as const;

const STAGE_LABELS: Record<string, string> = {
  OpportunityTagged: "Opportunity Tagged",
  FollowUp: "Follow-up",
  OnHold: "On Hold",
};

interface StageChangerProps {
  leadId: string;
  currentStage: string;
}

export function StageChanger({ leadId, currentStage }: StageChangerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [pendingStage, setPendingStage] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [lostNotes, setLostNotes] = useState("");

  const showConfirm = pendingStage !== null;
  const isLost = pendingStage === "Lost";

  const handleStageChange = (stage: string | null) => {
    if (!stage || stage === currentStage) return;
    setPendingStage(stage);
  };

  const confirmChange = async () => {
    if (!pendingStage) return;
    if (isLost && !lostReason) {
      toast.error("Please select a lost reason");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_stage: pendingStage,
          notes: notes || undefined,
          lost_reason: lostReason || undefined,
          lost_notes: lostNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to change stage");
        return;
      }
      toast.success(`Stage changed to ${pendingStage}`);
      setPendingStage(null);
      setNotes("");
      setLostReason("");
      setLostNotes("");
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <LeadStatusBadge status={currentStage} />
        <Select value={currentStage} onValueChange={handleStageChange}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {STAGE_LABELS[s] ?? s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Dialog open={showConfirm} onOpenChange={() => setPendingStage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Stage Change</DialogTitle>
            <DialogDescription>
              Moving lead to{" "}
              <strong>{STAGE_LABELS[pendingStage ?? ""] ?? pendingStage}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isLost && (
              <div className="space-y-1.5">
                <Label>Lost Reason *</Label>
                <Select value={lostReason} onValueChange={(v) => setLostReason(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOST_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r.replace(/([A-Z])/g, " $1").trim()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Notes {!isLost && "(optional)"}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add context..."
                rows={3}
              />
            </div>

            {isLost && (
              <div className="space-y-1.5">
                <Label>Additional Notes</Label>
                <Textarea
                  value={lostNotes}
                  onChange={(e) => setLostNotes(e.target.value)}
                  placeholder="Alternate requirement, remarks..."
                  rows={2}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingStage(null)}>
              Cancel
            </Button>
            <Button onClick={confirmChange} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
