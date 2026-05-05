"use client";

export default function LeadsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6 space-y-3">
      <h2 className="text-lg font-semibold text-destructive">Failed to load leads</h2>
      <pre className="text-sm bg-muted p-4 rounded overflow-auto whitespace-pre-wrap">{error.message}</pre>
      {error.digest && (
        <p className="text-xs text-muted-foreground">Digest: <code>{error.digest}</code></p>
      )}
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="text-sm px-3 py-1.5 rounded border border-border hover:bg-muted transition-colors"
        >
          Try again
        </button>
        <a
          href="/api/health/leads-page"
          target="_blank"
          className="text-sm px-3 py-1.5 rounded border border-border hover:bg-muted transition-colors"
        >
          Run diagnostics
        </a>
      </div>
    </div>
  );
}
