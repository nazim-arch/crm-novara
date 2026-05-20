export default function Loading() {
  return (
    <div className="p-3 sm:p-6 space-y-6 animate-pulse">
      <div className="flex flex-col gap-1">
        <div className="h-7 w-28 rounded bg-muted" />
        <div className="h-4 w-80 rounded bg-muted" />
      </div>
      <div className="h-16 rounded-lg bg-muted" />
      <div className="border rounded-lg overflow-hidden">
        <div className="h-10 bg-muted/50" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 border-t bg-background px-4 flex items-center gap-4">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-5 w-20 rounded-full bg-muted" />
            <div className="h-4 w-40 rounded bg-muted" />
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="h-4 w-20 rounded bg-muted" />
            <div className="h-4 w-28 rounded bg-muted" />
            <div className="h-4 w-24 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

