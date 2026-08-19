"use client";

import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Matches a media query on the client. Defaults to the mobile breakpoint used across the app.
 * SSR-safe: renders `false` until mounted.
 */
export function useIsMobile(query = "(max-width: 639px)") {
  const [matches, setMatches] = React.useState(false);
  React.useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

/**
 * A modal that renders as a scrollable bottom Sheet on mobile and a centered Dialog on desktop —
 * so every field and action stays reachable with the on-screen keyboard open. Controlled via
 * `open`/`onOpenChange` (no trigger element, avoiding nested-button hydration issues).
 */
export function ActionModal({
  open,
  onOpenChange,
  title,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className={cn("rounded-t-2xl px-0 max-h-[88dvh]", className)}>
          <SheetHeader className="px-4 pb-2 border-b">
            <SheetTitle className="text-base text-left">{title}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pt-3 pb-8 overflow-y-auto overscroll-contain">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-md max-h-[90vh] overflow-y-auto", className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
