"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LeadStatusBadge, TemperatureBadge } from "@/components/shared/LeadStatusBadge";
import { AlertTriangle, ExternalLink, GitMerge, Plus } from "lucide-react";

type DuplicateLead = {
  id: string;
  lead_number: string;
  full_name: string;
  phone: string;
  email: string | null;
  status: string;
  temperature: string;
};

interface DuplicateWarningModalProps {
  open: boolean;
  exactMatches: DuplicateLead[];
  nameSimilar: DuplicateLead[];
  onOpenExisting: (id: string) => void;
  onContinue: () => void;
  onClose: () => void;
}

export function DuplicateWarningModal({
  open,
  exactMatches,
  nameSimilar,
  onOpenExisting,
  onContinue,
  onClose,
}: DuplicateWarningModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle>Possible Duplicate Detected</DialogTitle>
          </div>
          <DialogDescription>
            We found existing leads with similar information. Please review before
            continuing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-72 overflow-y-auto">
          {exactMatches.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                Exact matches (phone / email)
              </p>
              {exactMatches.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  onOpen={() => onOpenExisting(lead.id)}
                />
              ))}
            </div>
          )}
          {nameSimilar.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                Similar names
              </p>
              {nameSimilar.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  onOpen={() => onOpenExisting(lead.id)}
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="sm:mr-auto">
            Cancel
          </Button>
          <Button variant="secondary" onClick={onContinue}>
            <Plus className="h-4 w-4 mr-1" />
            Create Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeadRow({
  lead,
  onOpen,
}: {
  lead: DuplicateLead;
  onOpen: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 mb-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-muted-foreground">
            {lead.lead_number}
          </span>
          <span className="font-medium text-sm">{lead.full_name}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs text-muted-foreground">{lead.phone}</span>
          <LeadStatusBadge status={lead.status} />
          <TemperatureBadge temperature={lead.temperature} />
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onOpen}
        className="shrink-0 ml-2"
      >
        <ExternalLink className="h-3.5 w-3.5 mr-1" />
        Open
      </Button>
    </div>
  );
}
