"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  role: string;
}

interface Props {
  leadId: string;
  leadNumber: string;
  agents: Agent[];
}

export function ReleaseLeadAction({ leadId, leadNumber, agents }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  function release() {
    if (!agentId) return;
    startTransition(async () => {
      const res = await fetch(`/api/leads/${leadId}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to_id: agentId }),
      });
      if (res.ok) {
        toast.success(`${leadNumber} released to agent`);
        setOpen(false);
        setAgentId("");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to release lead");
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5 mr-1.5" />
        Release
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!isPending) setOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release {leadNumber} to an agent</DialogTitle>
            <DialogDescription>
              The lead re-enters the pipeline as <strong>New</strong>, owned and assigned to the
              chosen agent. This is audit-logged.
            </DialogDescription>
          </DialogHeader>
          <Select value={agentId} onValueChange={(v) => setAgentId(v ?? "")}>
            <SelectTrigger aria-label="Choose an agent">
              <SelectValue placeholder="Choose an agent" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} <span className="text-muted-foreground">({a.role})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={release} disabled={!agentId || isPending}>
              {isPending ? "Releasing…" : "Release lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
