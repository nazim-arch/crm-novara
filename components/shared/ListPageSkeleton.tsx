import { Skeleton } from "@/components/ui/skeleton";

interface ListPageSkeletonProps {
  rows?: number;
  showFilters?: boolean;
}

/** Shared skeleton for list pages (leads, opportunities, tasks, follow-ups). */
export function ListPageSkeleton({ rows = 8, showFilters = true }: ListPageSkeletonProps) {
  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
      {showFilters && (
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-full sm:w-64 rounded-lg" />
          <Skeleton className="hidden sm:block h-9 w-36 rounded-lg" />
          <Skeleton className="hidden sm:block h-9 w-36 rounded-lg" />
        </div>
      )}
      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      {/* Desktop table */}
      <div className="hidden md:block rounded-lg border bg-card overflow-hidden">
        <div className="h-10 bg-muted/50 border-b" />
        <div className="divide-y">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
