"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableRow, TableCell } from "@/components/ui/table";

/**
 * Collapsible group section for a desktop table body. Renders a clickable
 * header row; the data rows (passed as children) show only when expanded.
 * Collapsed by default so grouped lists start compact.
 */
export function CollapsibleTableGroup({
  label,
  count,
  colSpan,
  defaultOpen = false,
  children,
}: {
  label: string;
  count: number;
  colSpan: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/60 cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <TableCell colSpan={colSpan} className="py-1.5">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"
            aria-expanded={open}
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
            {label} <span className="font-normal">({count})</span>
          </button>
        </TableCell>
      </TableRow>
      {open && children}
    </>
  );
}

/**
 * Collapsible group section for the mobile card list. Renders a clickable
 * header; the cards (children) show only when expanded. Collapsed by default.
 */
export function CollapsibleCardGroup({
  label,
  count,
  defaultOpen = false,
  children,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 px-1 pt-2 w-full text-left"
      >
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">({count})</span>
      </button>
      {open && children}
    </div>
  );
}
