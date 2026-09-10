"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImportResult } from "@/lib/import/types";

// Shared success + failed-rows result view for every Import Hub entity.
// Extracted from the original LeadImportModal result block.
export function ImportResultPanel({
  result,
  noun,
  onReset,
  onDone,
}: {
  result: ImportResult;
  noun: string; // e.g. "lead", "opportunity"
  onReset: () => void;
  onDone?: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-lg border p-4 bg-muted/30">
        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold">
            {result.created} of {result.created + result.failed.length} {noun}{result.created + result.failed.length !== 1 ? "s" : ""} imported successfully
          </p>
          {result.failed.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {result.failed.length} row{result.failed.length !== 1 ? "s" : ""} failed — see below
            </p>
          )}
        </div>
      </div>

      {result.failed.length > 0 && (
        <div className="rounded-lg border border-destructive/30 overflow-hidden">
          <div className="bg-destructive/5 px-4 py-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <p className="text-sm font-semibold text-destructive">Failed rows</p>
          </div>
          <div className="divide-y max-h-52 overflow-y-auto">
            {result.failed.map((f, i) => (
              <div key={i} className="px-4 py-2.5">
                <p className="text-xs font-medium">
                  Row {f.row}{f.name ? ` — ${f.name}` : ""}
                </p>
                <ul className="mt-0.5 space-y-0.5">
                  {f.errors.map((e, j) => (
                    <li key={j} className="text-xs text-destructive">{e}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onReset}>Import another file</Button>
        {onDone && <Button size="sm" onClick={onDone}>Done</Button>}
      </div>
    </div>
  );
}
