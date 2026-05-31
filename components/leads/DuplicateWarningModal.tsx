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
import { AlertTriangle, ExternalLink } from "lucide-react";

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
  onClose: () => void;
}

export function DuplicateWarningModal({
  open,
  exactMatches,
  nameSimilar,
  onOpenExisting,
  onClose,
}: DuplicateWarningModalProps) {
  const allMatches = [...exactMatches, ...nameSimilar];
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive mb-1">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle>Lead Already Exists</DialogTitle>
          </div>
          <DialogDescription>
            A lead with this phone or email already exists. Open the existing lead to continue working with this contact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {allMatches.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              onOpen={() => onOpenExisting(lead.id)}
            />
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
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
