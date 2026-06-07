"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, CheckCircle2, AlertCircle, Loader2, FileText } from "lucide-react";
import type { BackfillResult } from "@/app/api/admin/meta-backfill/route";

export default function MetaBackfillPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function run() {
    if (!file || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/admin/meta-backfill", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Server error ${res.status}`);
        return;
      }
      setResult(json as BackfillResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meta Historical Lead Backfill</h1>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          Upload the Meta historical leads CSV to attach Meta attribution (leadgen_id, ad_id, campaign_id)
          to existing CRM leads. Rows with no matching CRM lead will create a new lead.
          Idempotent — safe to re-run multiple times.
        </p>
      </div>

      {/* Upload card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload CSV</CardTitle>
          <CardDescription>
            Expected format: <code className="text-xs">leadgen_id, form_id, created_time, ad_id, adset_id, campaign_id, full_name, phone, email, city, raw_fields</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <button
            type="button"
            className="w-full border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/60 hover:bg-muted/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => inputRef.current?.click()}
          >
            {file ? (
              <div className="flex flex-col items-center gap-1">
                <FileText className="h-8 w-8 text-primary" />
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB — click to change</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Click to select <span className="font-medium text-foreground">meta_historical_leads.csv</span>
                </p>
              </div>
            )}
          </button>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              setResult(null);
              setError(null);
            }}
          />

          <Button onClick={run} disabled={!file || loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running backfill…
              </>
            ) : (
              "Run Backfill"
            )}
          </Button>

          {loading && (
            <p className="text-xs text-center text-muted-foreground">
              Processing 900+ rows — this may take 30–60 seconds. Do not close this tab.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Backfill complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBox label="Total rows" value={result.total} />
              <StatBox label="Matched" value={result.matched} variant="blue" />
              <StatBox label="Created" value={result.created} variant="green" />
              <StatBox label="Skipped" value={result.skipped} variant="muted" />
            </div>

            {result.errors.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">
                  {result.errors.length} row{result.errors.length !== 1 ? "s" : ""} could not be processed
                </p>
                <div className="max-h-52 overflow-y-auto space-y-1 rounded border bg-muted/30 p-2">
                  {result.errors.map((e) => (
                    <div key={e.leadgen_id} className="flex items-start gap-2 text-xs">
                      <span className="font-mono text-foreground shrink-0">{e.leadgen_id}</span>
                      <span className="text-muted-foreground">— {e.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.errors.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No errors. Re-running this job will produce 0 matched, 0 created, {result.total} skipped.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatBox({
  label, value, variant,
}: {
  label: string;
  value: number;
  variant?: "blue" | "green" | "muted";
}) {
  const color =
    variant === "blue"  ? "text-blue-600 dark:text-blue-400" :
    variant === "green" ? "text-emerald-600 dark:text-emerald-400" :
    variant === "muted" ? "text-muted-foreground" :
    "text-foreground";

  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
