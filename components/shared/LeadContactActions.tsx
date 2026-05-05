"use client";

import { useState } from "react";
import { Phone, MessageCircle, Send, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import {
  telUrl, whatsappUrl, whatsappMessageUrl, buildWaMessage, isValidPhone,
} from "@/lib/phone";

// ── Types ──────────────────────────────────────────────────────────────────

type ContactType = "call_attempted" | "whatsapp_opened" | "whatsapp_message_sent";

export interface LeadContactProps {
  leadId: string;
  phone: string | null;
  leadName: string;
  agentName: string;
  propertyType?: string | null;
  location?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  /** compact = icon-only (table / dashboard), full = labelled (detail page) */
  variant?: "compact" | "full";
}

// ── Log Activity Dialog ────────────────────────────────────────────────────

function LogDialog({
  open, onClose, leadId, contactType, leadName,
}: {
  open: boolean;
  onClose: () => void;
  leadId: string;
  contactType: ContactType;
  leadName: string;
}) {
  const [logging, setLogging] = useState(false);

  const label: Record<ContactType, string> = {
    call_attempted:        "Log as Call Attempted",
    whatsapp_opened:       "Log as WhatsApp Opened",
    whatsapp_message_sent: "Log as WhatsApp Message Sent",
  };

  async function log(type: ContactType) {
    setLogging(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (res.ok) {
        toast.success("Activity logged", {
          description: `${leadName} — ${label[type].replace("Log as ", "")}`,
        });
      } else {
        toast.error("Failed to log activity");
      }
    } catch {
      toast.error("Failed to log activity");
    } finally {
      setLogging(false);
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Log this contact?
          </DialogTitle>
          <DialogDescription>
            {leadName} — record this interaction in the activity timeline.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-1">
          <Button
            onClick={() => log(contactType)}
            disabled={logging}
            className="justify-start"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {label[contactType]}
          </Button>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={logging}
            className="justify-start text-muted-foreground"
          >
            <X className="h-4 w-4 mr-2" />
            Skip — don&apos;t log
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Styled anchor that looks like a Button (full variant) ──────────────────

function ActionLink({
  href, target, rel, onClick, children, title,
}: {
  href: string;
  target?: string;
  rel?: string;
  onClick?: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <a
      href={href}
      target={target}
      rel={rel}
      title={title}
      onClick={onClick}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium whitespace-nowrap hover:bg-muted transition-colors"
    >
      {children}
    </a>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function LeadContactActions({
  leadId, phone, leadName, agentName,
  propertyType, location, budgetMin, budgetMax,
  variant = "compact",
}: LeadContactProps) {
  const [logOpen, setLogOpen]         = useState(false);
  const [contactType, setContactType] = useState<ContactType>("call_attempted");

  const valid      = isValidPhone(phone);
  const callHref   = valid ? telUrl(phone)      : null;
  const waHref     = valid ? whatsappUrl(phone) : null;
  const waMessage  = valid
    ? buildWaMessage({ leadName, agentName, propertyType, location, budgetMin, budgetMax })
    : null;
  const waMsgHref  = valid && waMessage ? whatsappMessageUrl(phone, waMessage) : null;

  function openLog(type: ContactType) {
    setContactType(type);
    setLogOpen(true);
  }

  // ── Full variant (lead detail page) ───────────────────────────────────────
  if (variant === "full") {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-2 flex-wrap">
          {callHref ? (
            <ActionLink href={callHref} onClick={() => openLog("call_attempted")}>
              <Phone className="h-3.5 w-3.5 text-green-600" />
              <span>Call</span>
            </ActionLink>
          ) : (
            <Tooltip>
              <TooltipTrigger>
                <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium opacity-40 cursor-not-allowed">
                  <Phone className="h-3.5 w-3.5" />
                  Call
                </span>
              </TooltipTrigger>
              <TooltipContent>Phone number not available</TooltipContent>
            </Tooltip>
          )}

          {waHref ? (
            <ActionLink href={waHref} target="_blank" rel="noopener noreferrer" onClick={() => openLog("whatsapp_opened")}>
              <MessageCircle className="h-3.5 w-3.5 text-green-500" />
              <span>WhatsApp</span>
            </ActionLink>
          ) : (
            <Tooltip>
              <TooltipTrigger>
                <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium opacity-40 cursor-not-allowed">
                  <MessageCircle className="h-3.5 w-3.5" />
                  WhatsApp
                </span>
              </TooltipTrigger>
              <TooltipContent>Phone number not available</TooltipContent>
            </Tooltip>
          )}

          {waMsgHref && (
            <ActionLink href={waMsgHref} target="_blank" rel="noopener noreferrer" onClick={() => openLog("whatsapp_message_sent")}>
              <Send className="h-3.5 w-3.5 text-blue-500" />
              <span>WA Message</span>
            </ActionLink>
          )}

          <LogDialog open={logOpen} onClose={() => setLogOpen(false)} leadId={leadId} contactType={contactType} leadName={leadName} />
        </div>
      </TooltipProvider>
    );
  }

  // ── Compact variant (table rows / dashboard) ──────────────────────────────
  return (
    <TooltipProvider>
      <div className="flex items-center gap-0.5">
        {callHref ? (
          <Tooltip>
            <TooltipTrigger>
              <a
                href={callHref}
                onClick={() => openLog("call_attempted")}
                className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-green-50 dark:hover:bg-green-950/30 text-green-600 transition-colors"
                aria-label="Call"
              >
                <Phone className="h-3.5 w-3.5" />
              </a>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="font-medium">Call</p>
              <p className="text-xs text-muted-foreground">{phone}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground/30 cursor-not-allowed">
                <Phone className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>No phone number</TooltipContent>
          </Tooltip>
        )}

        {waHref ? (
          <Tooltip>
            <TooltipTrigger>
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => openLog("whatsapp_opened")}
                className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-green-50 dark:hover:bg-green-950/30 text-green-500 transition-colors"
                aria-label="WhatsApp"
              >
                <MessageCircle className="h-3.5 w-3.5" />
              </a>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="font-medium">WhatsApp</p>
              <p className="text-xs text-muted-foreground">{phone}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground/30 cursor-not-allowed">
                <MessageCircle className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>No phone number</TooltipContent>
          </Tooltip>
        )}

        {waMsgHref && (
          <Tooltip>
            <TooltipTrigger>
              <a
                href={waMsgHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => openLog("whatsapp_message_sent")}
                className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-blue-50 dark:hover:bg-blue-950/30 text-blue-500 transition-colors"
                aria-label="Send WhatsApp message"
              >
                <Send className="h-3.5 w-3.5" />
              </a>
            </TooltipTrigger>
            <TooltipContent side="top">Send pre-filled message</TooltipContent>
          </Tooltip>
        )}

        <LogDialog open={logOpen} onClose={() => setLogOpen(false)} leadId={leadId} contactType={contactType} leadName={leadName} />
      </div>
    </TooltipProvider>
  );
}
