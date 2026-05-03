"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, Download, X, CheckCircle2, AlertCircle, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useRouter } from "next/navigation";

// ─── Column name aliases ───────────────────────────────────────────────────────
const COLUMN_MAP: Record<string, string> = {
  "full name": "full_name",
  "name": "full_name",
  "full_name": "full_name",
  "phone": "phone",
  "mobile": "phone",
  "phone number": "phone",
  "contact": "phone",
  "lead source": "lead_source",
  "source": "lead_source",
  "lead_source": "lead_source",
  "property type": "property_type",
  "property_type": "property_type",
  "type": "property_type",
  "purpose": "purpose",
  "potential lead value": "potential_lead_value",
  "pipeline value": "potential_lead_value",
  "potential_lead_value": "potential_lead_value",
  "lead value": "potential_lead_value",
  "email": "email",
  "email address": "email",
  "whatsapp": "whatsapp",
  "whatsapp number": "whatsapp",
  "temperature": "temperature",
  "priority": "temperature",
  "budget min": "budget_min",
  "budget_min": "budget_min",
  "min budget": "budget_min",
  "budget max": "budget_max",
  "budget_max": "budget_max",
  "max budget": "budget_max",
  "unit type": "unit_type",
  "unit_type": "unit_type",
  "configuration": "unit_type",
  "location preference": "location_preference",
  "location_preference": "location_preference",
  "location": "location_preference",
  "preferred location": "location_preference",
  "timeline to buy": "timeline_to_buy",
  "timeline_to_buy": "timeline_to_buy",
  "timeline": "timeline_to_buy",
  "campaign source": "campaign_source",
  "campaign_source": "campaign_source",
  "campaign": "campaign_source",
  "referral source": "referral_source",
  "referral_source": "referral_source",
  "referral": "referral_source",
  "referred by": "referral_source",
  "reason": "reason_for_interest",
  "reason for interest": "reason_for_interest",
  "reason_for_interest": "reason_for_interest",
  "notes": "notes",
  "note": "notes",
  "remarks": "notes",
};

const MANDATORY = ["full_name", "phone", "lead_source", "property_type", "purpose", "potential_lead_value"];

const MANDATORY_LABELS: Record<string, string> = {
  full_name: "Full Name",
  phone: "Phone",
  lead_source: "Lead Source",
  property_type: "Property Type",
  purpose: "Purpose",
  potential_lead_value: "Potential Lead Value",
};

type ParsedRow = Record<string, string | number | undefined>;

interface FailedRow {
  row: number;
  name: string;
  errors: string[];
}

interface ImportResult {
  created: number;
  failed: FailedRow[];
}

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
    "Full Name*", "Phone*", "Lead Source*", "Property Type*", "Purpose*", "Potential Lead Value*",
    "Email", "WhatsApp", "Temperature", "Budget Min", "Budget Max",
    "Unit Type", "Location Preference", "Timeline to Buy",
    "Campaign Source", "Referral Source", "Notes",
  ];

  const notes = [
    "Min 2 chars", "Min 7 digits", "e.g. Website, Facebook, Referral",
    "Residential | Commercial | Plot | Villa | Apartment | Office",
    "EndUse | Investment", "Numeric (e.g. 5000000)",
    "Optional", "Optional", "Hot | Warm | Cold | FollowUpLater (default: Cold)",
    "Optional numeric", "Optional numeric",
    "e.g. 2BHK", "e.g. Whitefield", "e.g. 3 months",
    "Optional", "Optional", "Optional",
  ];

  const sampleRow = [
    "Rajesh Kumar", "9876543210", "Facebook", "Apartment", "EndUse", "7500000",
    "rajesh@example.com", "9876543210", "Warm", "6000000", "9000000",
    "2BHK", "Koramangala", "6 months",
    "Summer Campaign", "", "Looking for ready to move",
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, notes, sampleRow]);

  // Style header row width
  ws["!cols"] = headers.map(() => ({ wch: 22 }));

  XLSX.utils.book_append_sheet(wb, ws, "Leads Template");
  XLSX.writeFile(wb, "leads_import_template.xlsx");
}

export function LeadImportModal() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headerMap, setHeaderMap] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState("");
  const [missingMandatory, setMissingMandatory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function reset() {
    setRows([]);
    setHeaderMap({});
    setFileName("");
    setMissingMandatory([]);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose() {
    setOpen(false);
    reset();
  }

  function handleFile(file: File) {
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      const wb = XLSX.read(data, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (raw.length === 0) {
        setMissingMandatory(["File appears empty"]);
        setRows([]);
        return;
      }

      const rawHeaders = Object.keys(raw[0]);
      const map = mapHeaders(rawHeaders);
      setHeaderMap(map);

      // Check mandatory columns are present
      const mappedFields = new Set(Object.values(map));
      const missing = MANDATORY.filter(f => !mappedFields.has(f)).map(f => MANDATORY_LABELS[f]);
      setMissingMandatory(missing);

      // Normalize rows
      const normalized: ParsedRow[] = raw.map(r => {
        const row: ParsedRow = {};
        for (const [rawCol, fieldKey] of Object.entries(map)) {
          row[fieldKey] = r[rawCol] as string | number | undefined;
        }
        return row;
      });

      setRows(normalized);
    };
    reader.readAsBinaryString(file);
  }

  async function handleImport() {
    if (rows.length === 0 || missingMandatory.length > 0) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: rows }),
      });
      const data: ImportResult = await res.json();
      setResult(data);
      if (data.created > 0) router.refresh();
    } catch {
      setResult({ created: 0, failed: [{ row: 0, name: "", errors: ["Network error — please try again"] }] });
    } finally {
      setLoading(false);
    }
  }

  const previewRows = rows.slice(0, 5);
  const canImport = rows.length > 0 && missingMandatory.length === 0 && !result;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4 mr-1" />
        Import Excel
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Import Leads from Excel
            </DialogTitle>
            <DialogDescription>
              Upload an .xlsx, .xls, or .csv file. All imported leads are assigned to you and can be reassigned after import.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Template download */}
            <div className="flex items-center justify-between rounded-lg border border-dashed p-4 bg-muted/30">
              <div>
                <p className="text-sm font-medium">Don&apos;t have a template?</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Download our template with the correct column headers and sample data.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-1" />
                Download Template
              </Button>
            </div>

            {/* Mandatory columns reference */}
            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Required columns (*)
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.values(MANDATORY_LABELS).map(label => (
                  <span key={label} className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                    {label}
                  </span>
                ))}
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
                <p><strong>Property Type:</strong> Residential · Commercial · Plot · Villa · Apartment · Office</p>
                <p><strong>Purpose:</strong> EndUse · Investment</p>
                <p><strong>Temperature:</strong> Hot · Warm · Cold · FollowUpLater (defaults to Cold if blank)</p>
              </div>
            </div>

            {/* File upload */}
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
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">
                  {fileName ? fileName : "Click to upload or drag & drop"}
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

            {/* Missing mandatory columns warning */}
            {missingMandatory.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 flex gap-3">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive">Missing required columns</p>
                  <p className="text-xs text-destructive/80 mt-1">
                    {missingMandatory.join(", ")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Download the template above to see the correct column headers.
                  </p>
                </div>
              </div>
            )}

            {/* Preview table */}
            {rows.length > 0 && missingMandatory.length === 0 && !result && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Preview — {rows.length} row{rows.length !== 1 ? "s" : ""} detected
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
                        {MANDATORY.map(f => (
                          <th key={f} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                            {MANDATORY_LABELS[f]} *
                          </th>
                        ))}
                        <th className="px-3 py-2 text-left font-semibold">Email</th>
                        <th className="px-3 py-2 text-left font-semibold">Temp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className="border-t">
                          {MANDATORY.map(f => (
                            <td key={f} className={`px-3 py-2 whitespace-nowrap ${!row[f] ? "text-destructive font-medium" : ""}`}>
                              {row[f] !== undefined && row[f] !== "" ? String(row[f]) : <span className="opacity-50">—</span>}
                            </td>
                          ))}
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                            {row.email ? String(row.email) : <span className="opacity-40">—</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {row.temperature ? String(row.temperature) : <span className="opacity-40">Cold</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-lg border p-4 bg-muted/30">
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">
                      {result.created} lead{result.created !== 1 ? "s" : ""} imported successfully
                    </p>
                    {result.failed.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {result.failed.length} row{result.failed.length !== 1 ? "s" : ""} failed
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
                  <Button variant="outline" size="sm" onClick={reset}>
                    Import another file
                  </Button>
                  <Button size="sm" onClick={handleClose}>Done</Button>
                </div>
              </div>
            )}

            {/* Action buttons */}
            {!result && (
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleImport} disabled={!canImport || loading}>
                  {loading ? "Importing…" : `Import ${rows.length > 0 ? rows.length + " " : ""}Lead${rows.length !== 1 ? "s" : ""}`}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
