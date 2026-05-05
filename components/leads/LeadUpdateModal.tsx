"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { PenSquare, Download, X, CheckCircle2, AlertCircle, FileSpreadsheet, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useRouter } from "next/navigation";

// ── Column aliases (all map to internal field names) ───────────────────────

const COLUMN_MAP: Record<string, string> = {
  // Identifier
  "lead number":        "lead_number",
  "lead_number":        "lead_number",
  "lead no":            "lead_number",
  "id":                 "lead_number",
  // Updatable fields
  "temperature":        "temperature",
  "priority":           "temperature",
  "status":             "status",
  "stage":              "status",
  "next followup date": "next_followup_date",
  "next_followup_date": "next_followup_date",
  "followup date":      "next_followup_date",
  "follow up date":     "next_followup_date",
  "follow-up date":     "next_followup_date",
  "followup type":      "followup_type",
  "follow up type":     "followup_type",
  "follow-up type":     "followup_type",
  "followup_type":      "followup_type",
  "potential lead value": "potential_lead_value",
  "potential_lead_value": "potential_lead_value",
  "lead value":         "potential_lead_value",
  "value":              "potential_lead_value",
  "pipeline value":     "potential_lead_value",
  "assigned to":        "assigned_to_name",
  "assigned_to":        "assigned_to_name",
  "assigned_to_name":   "assigned_to_name",
  "owner":              "assigned_to_name",
  "sales person":       "assigned_to_name",
  "email":              "email",
  "whatsapp":           "whatsapp",
  "budget min":         "budget_min",
  "budget_min":         "budget_min",
  "min budget":         "budget_min",
  "budget max":         "budget_max",
  "budget_max":         "budget_max",
  "max budget":         "budget_max",
  "location":           "location_preference",
  "location preference":"location_preference",
  "location_preference":"location_preference",
  "preferred location": "location_preference",
  "unit type":          "unit_type",
  "unit_type":          "unit_type",
  "configuration":      "unit_type",
  "bhk":                "unit_type",
  "timeline":           "timeline_to_buy",
  "timeline to buy":    "timeline_to_buy",
  "timeline_to_buy":    "timeline_to_buy",
  "notes":              "notes",
  "note":               "notes",
  "remarks":            "notes",
  "comment":            "notes",
};

const FIELD_LABELS: Record<string, string> = {
  lead_number:           "Lead Number",
  temperature:           "Temperature",
  status:                "Status",
  next_followup_date:    "Next Followup Date",
  followup_type:         "Followup Type",
  potential_lead_value:  "Potential Lead Value",
  assigned_to_name:      "Assigned To",
  email:                 "Email",
  whatsapp:              "WhatsApp",
  budget_min:            "Budget Min",
  budget_max:            "Budget Max",
  location_preference:   "Location Preference",
  unit_type:             "Unit Type",
  timeline_to_buy:       "Timeline to Buy",
  notes:                 "Notes",
};

const PREVIEW_FIELDS = ["lead_number", "status", "temperature", "next_followup_date", "potential_lead_value", "assigned_to_name"];

type ParsedRow = Record<string, string | number | undefined>;

interface FailedRow { row: number; lead_number: string; errors: string[] }
interface BulkUpdateResult { updated: number; skipped: number; failed: FailedRow[] }

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/\s+/g, " ");
}

function mapHeaders(rawHeaders: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of rawHeaders) {
    const key = COLUMN_MAP[normalizeHeader(h)];
    if (key) map[h] = key;
  }
  return map;
}

function downloadTemplate() {
  const wb = XLSX.utils.book_new();

  const headers = [
    "Lead Number*", "Status", "Temperature", "Next Followup Date", "Followup Type",
    "Potential Lead Value", "Assigned To", "Email", "WhatsApp",
    "Budget Min", "Budget Max", "Location Preference", "Unit Type",
    "Timeline to Buy", "Notes",
  ];

  const notes = [
    "e.g. LD-00042  (REQUIRED)",
    "New | Prospect | SiteVisitCompleted | Negotiation | Won | Lost | OnHold | Recycle",
    "Hot | Warm | Cold | FollowUpLater",
    "YYYY-MM-DD e.g. 2026-06-15",
    "Call | Email | WhatsApp | Visit | Meeting | Activity | Internal",
    "Numeric e.g. 7500000",
    "Exact user name as in CRM",
    "Optional",
    "Optional",
    "Optional numeric",
    "Optional numeric",
    "e.g. Whitefield",
    "e.g. 2BHK",
    "e.g. 3 months",
    "Appended as a note on the lead",
  ];

  const sample = [
    "LD-00042", "Prospect", "Warm", "2026-06-15", "Call",
    "7500000", "Rahul Sharma", "", "",
    "", "", "Koramangala", "2BHK",
    "6 months", "Client confirmed budget",
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, notes, sample]);
  ws["!cols"] = headers.map(() => ({ wch: 24 }));
  XLSX.utils.book_append_sheet(wb, ws, "Leads Update Template");
  XLSX.writeFile(wb, "leads_update_template.xlsx");
}

// ── Main Component ─────────────────────────────────────────────────────────

export function LeadUpdateModal() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState<ParsedRow[]>([]);
  const [detectedFields, setDetectedFields] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [missingId, setMissingId] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<BulkUpdateResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router  = useRouter();

  function reset() {
    setRows([]); setDetectedFields([]); setFileName("");
    setMissingId(false); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose() { setOpen(false); reset(); }

  function handleFile(file: File) {
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const data  = e.target?.result;
      const wb    = XLSX.read(data, { type: "binary", cellDates: true });
      const ws    = wb.Sheets[wb.SheetNames[0]];
      const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (raw.length === 0) { setMissingId(true); setRows([]); return; }

      const rawHeaders = Object.keys(raw[0]);
      const map = mapHeaders(rawHeaders);
      const mappedFields = Object.values(map);

      setMissingId(!mappedFields.includes("lead_number"));
      setDetectedFields(mappedFields.filter(f => f !== "lead_number"));

      // Normalize rows — convert dates to ISO strings
      const normalized: ParsedRow[] = raw.map(r => {
        const row: ParsedRow = {};
        for (const [rawCol, fieldKey] of Object.entries(map)) {
          const val = r[rawCol];
          if (val instanceof Date) {
            row[fieldKey] = val.toISOString().slice(0, 10);
          } else {
            row[fieldKey] = val as string | number | undefined;
          }
        }
        return row;
      });

      setRows(normalized);
    };
    reader.readAsBinaryString(file);
  }

  async function handleUpdate() {
    if (rows.length === 0 || missingId) return;
    setLoading(true); setResult(null);
    try {
      const res  = await fetch("/api/leads/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: rows }),
      });
      const data: BulkUpdateResult = await res.json();
      setResult(data);
      if (data.updated > 0) router.refresh();
    } catch {
      setResult({ updated: 0, skipped: 0, failed: [{ row: 0, lead_number: "—", errors: ["Network error — please try again"] }] });
    } finally {
      setLoading(false);
    }
  }

  const previewRows = rows.slice(0, 5);
  const canUpdate   = rows.length > 0 && !missingId && !result;
  const showPreview = rows.length > 0 && !missingId && !result;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PenSquare className="h-4 w-4 mr-1" />
        Update via Excel
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Bulk Update Leads via Excel
            </DialogTitle>
            <DialogDescription>
              Upload a sheet with a <strong>Lead Number</strong> column. Only the columns you include will be updated — blank cells are ignored.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">

            {/* Template download */}
            <div className="flex items-center justify-between rounded-lg border border-dashed p-4 bg-muted/30">
              <div>
                <p className="text-sm font-medium">Download the update template</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Contains correct column headers and sample data. Only include columns you want to update.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-1" />
                Download Template
              </Button>
            </div>

            {/* Field reference */}
            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Updatable fields
              </p>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                  Lead Number *
                </span>
                {Object.entries(FIELD_LABELS).filter(([k]) => k !== "lead_number").map(([, label]) => (
                  <span key={label} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {label}
                  </span>
                ))}
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
                <p><strong>Status:</strong> New · Prospect · SiteVisitCompleted · Negotiation · Won · Lost · OnHold · Recycle</p>
                <p><strong>Temperature:</strong> Hot · Warm · Cold · FollowUpLater</p>
                <p><strong>Followup Type:</strong> Call · Email · WhatsApp · Visit · Meeting · Activity · Internal</p>
                <p><strong>Date format:</strong> YYYY-MM-DD (e.g. 2026-06-15)</p>
                <p><strong>Assigned To:</strong> must match the user&apos;s exact name in the CRM</p>
              </div>
            </div>

            {/* Upload area */}
            {!result && (
              <div
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 p-8 cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) handleFile(f);
                }}
              >
                <PenSquare className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">
                  {fileName || "Click to upload or drag & drop"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">.xlsx · .xls · .csv — max 500 rows</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>
            )}

            {/* Missing lead_number column error */}
            {missingId && rows.length === 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 flex gap-3">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive">File appears empty or unreadable</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Make sure the file has data rows and try again.
                  </p>
                </div>
              </div>
            )}
            {missingId && rows.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 flex gap-3">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive">Missing required column: Lead Number</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add a column named &quot;Lead Number&quot; (e.g. LD-00042) so each row can be matched to a lead.
                  </p>
                </div>
              </div>
            )}

            {/* Detected fields */}
            {showPreview && detectedFields.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Will update:</span>
                {detectedFields.map(f => (
                  <span key={f} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {FIELD_LABELS[f] ?? f}
                  </span>
                ))}
              </div>
            )}

            {/* Preview table */}
            {showPreview && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Preview — {rows.length} row{rows.length !== 1 ? "s" : ""} ready
                    {rows.length > 5 && <span className="text-muted-foreground"> (showing first 5)</span>}
                  </p>
                  <button
                    type="button"
                    onClick={reset}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border text-xs">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        {PREVIEW_FIELDS.filter(f => detectedFields.includes(f) || f === "lead_number").map(f => (
                          <th key={f} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                            {FIELD_LABELS[f]}
                            {f === "lead_number" && " *"}
                          </th>
                        ))}
                        {detectedFields.filter(f => !PREVIEW_FIELDS.includes(f)).length > 0 && (
                          <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                            +{detectedFields.filter(f => !PREVIEW_FIELDS.includes(f)).length} more
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className="border-t">
                          {PREVIEW_FIELDS.filter(f => detectedFields.includes(f) || f === "lead_number").map(f => (
                            <td key={f} className={`px-3 py-2 whitespace-nowrap ${f === "lead_number" && !row[f] ? "text-destructive font-medium" : ""}`}>
                              {row[f] !== undefined && row[f] !== "" ? String(row[f]) : (
                                <span className="opacity-30 italic">no change</span>
                              )}
                            </td>
                          ))}
                          {detectedFields.filter(f => !PREVIEW_FIELDS.includes(f)).length > 0 && (
                            <td className="px-3 py-2 text-muted-foreground italic">…</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Cells showing &quot;no change&quot; will be skipped — only filled cells are updated.
                </p>
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{result.updated}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Updated</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold text-muted-foreground">{result.skipped}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                      <SkipForward className="h-3 w-3" /> Skipped (no changes)
                    </p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className={`text-2xl font-bold ${result.failed.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {result.failed.length}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Failed</p>
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
                          <p className="text-xs font-medium">Row {f.row} — {f.lead_number}</p>
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

                {result.updated > 0 && (
                  <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    {result.updated} lead{result.updated !== 1 ? "s" : ""} updated successfully. The leads list has been refreshed.
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={reset}>Update another file</Button>
                  <Button size="sm" onClick={handleClose}>Done</Button>
                </div>
              </div>
            )}

            {/* Actions */}
            {!result && (
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleUpdate} disabled={!canUpdate || loading}>
                  {loading
                    ? "Updating…"
                    : `Update ${rows.length > 0 ? rows.length + " " : ""}Lead${rows.length !== 1 ? "s" : ""}`
                  }
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
