"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { normalizeCellValue, mapHeaders } from "@/lib/import/normalize";
import { TemplateDownloadButton } from "@/components/import/TemplateDownloadButton";
import { ImportResultPanel } from "@/components/import/ImportResultPanel";
import type { EntityImportConfig, ImportResult, ParsedRow } from "@/lib/import/types";

// Generic client-side importer: file drop → ExcelJS parse → header mapping →
// mandatory check → preview → POST { rows } → result. One instance per entity,
// driven entirely by its EntityImportConfig. Generalized from LeadImportModal.
export function ImportPanel({ config, onDone }: { config: EntityImportConfig; onDone?: () => void }) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [missingMandatory, setMissingMandatory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  function reset() {
    setRows([]);
    setFileName("");
    setMissingMandatory([]);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFile(file: File) {
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const ExcelJS = await import("exceljs");
      const data = e.target?.result as ArrayBuffer;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(data);

      const ws = wb.worksheets[0];
      if (!ws || ws.rowCount < 1) {
        setMissingMandatory(["File appears empty"]);
        setRows([]);
        return;
      }

      const colCount = ws.columnCount;
      const rawHeaders: string[] = [];
      for (let c = 1; c <= colCount; c++) {
        rawHeaders.push(String(ws.getRow(1).getCell(c).value ?? "").trim());
      }

      const raw: Record<string, unknown>[] = [];
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const obj: Record<string, unknown> = {};
        rawHeaders.forEach((header, i) => {
          if (!header) return;
          obj[header] = normalizeCellValue(row.getCell(i + 1).value);
        });
        if (Object.values(obj).some((v) => v !== "" && v !== null && v !== undefined)) raw.push(obj);
      }

      if (raw.length === 0) {
        setMissingMandatory(["File appears empty"]);
        setRows([]);
        return;
      }

      const map = mapHeaders(rawHeaders, config.columnMap);
      const mappedFields = new Set(Object.values(map));
      const missing = config.mandatory.filter((f) => !mappedFields.has(f)).map((f) => config.mandatoryLabels[f] ?? f);
      setMissingMandatory(missing);

      const normalized: ParsedRow[] = raw.map((r) => {
        const row: ParsedRow = {};
        for (const [rawCol, fieldKey] of Object.entries(map)) {
          row[fieldKey] = r[rawCol] as string | number | undefined;
        }
        return row;
      });
      setRows(normalized);
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleImport() {
    if (rows.length === 0 || missingMandatory.length > 0) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data: ImportResult = await res.json();
      setResult(data);
      if (data.created > 0) startTransition(() => router.refresh());
    } catch {
      setResult({ created: 0, failed: [{ row: 0, name: "", errors: ["Network error — please try again"] }] });
    } finally {
      setLoading(false);
    }
  }

  const previewRows = rows.slice(0, 5);
  const canImport = rows.length > 0 && missingMandatory.length === 0 && !result;

  return (
    <div className="space-y-5">
      {/* Template + required-columns reference */}
      <div className="flex items-center justify-between rounded-lg border border-dashed p-4 bg-muted/30">
        <div>
          <p className="text-sm font-medium">Don&apos;t have a template?</p>
          <p className="text-xs text-muted-foreground mt-0.5">Download the template with the correct headers and a sample row.</p>
        </div>
        <TemplateDownloadButton config={config} />
      </div>

      <div className="rounded-lg border p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Required columns (*)</p>
        <div className="flex flex-wrap gap-2">
          {config.mandatory.map((f) => (
            <span key={f} className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
              {config.mandatoryLabels[f] ?? f}
            </span>
          ))}
        </div>
        {config.enumHints && config.enumHints.length > 0 && (
          <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
            {config.enumHints.map((h) => (
              <p key={h.label}><strong>{h.label}:</strong> {h.values}</p>
            ))}
          </div>
        )}
      </div>

      {/* Upload */}
      {!result && (
        <div
          className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 p-8 cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        >
          <Upload className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm font-medium">{fileName || "Click to upload or drag & drop"}</p>
          <p className="text-xs text-muted-foreground mt-1">.xlsx · .xls · .csv — max 500 rows</p>
          {config.helpText && <p className="text-xs text-muted-foreground mt-1 text-center max-w-md">{config.helpText}</p>}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      )}

      {/* Missing columns */}
      {missingMandatory.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 flex gap-3">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-destructive">Missing required columns</p>
            <p className="text-xs text-destructive/80 mt-1">{missingMandatory.join(", ")}</p>
            <p className="text-xs text-muted-foreground mt-1">Download the template above to see the correct headers.</p>
          </div>
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && missingMandatory.length === 0 && !result && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Preview — {rows.length} row{rows.length !== 1 ? "s" : ""} detected
              {rows.length > 5 && <span className="text-muted-foreground"> (showing first 5)</span>}
            </p>
            <button type="button" onClick={reset} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <X className="h-3 w-3" /> Clear
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border text-xs">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  {config.previewColumns.map((c) => (
                    <th key={c.field} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                      {c.label}{c.required ? " *" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-t">
                    {config.previewColumns.map((c) => {
                      const val = row[c.field];
                      const empty = val === undefined || val === "";
                      return (
                        <td key={c.field} className={`px-3 py-2 whitespace-nowrap ${c.required && empty ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          {!empty ? String(val) : <span className="opacity-50">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Result */}
      {result && <ImportResultPanel result={result} noun={config.entity} onReset={reset} onDone={onDone} />}

      {/* Actions */}
      {!result && (
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button onClick={handleImport} disabled={!canImport || loading}>
            {loading ? "Importing…" : `Import ${rows.length > 0 ? rows.length + " " : ""}${config.label}`}
          </Button>
        </div>
      )}
    </div>
  );
}
