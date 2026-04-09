"use client";

export default function LeadsError({ error }: { error: Error }) {
  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-destructive">Failed to load leads</h2>
      <pre className="mt-2 text-sm bg-muted p-4 rounded overflow-auto">{error.message}</pre>
    </div>
  );
}
