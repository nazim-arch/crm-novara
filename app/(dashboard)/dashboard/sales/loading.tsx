export default function Loading() {
  return (
    <div className="p-4 md:p-6 space-y-6 animate-pulse">
      <div className="flex flex-col gap-1">
        <div className="h-7 w-40 rounded bg-muted" />
        <div className="h-4 w-56 rounded bg-muted" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-64 rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
