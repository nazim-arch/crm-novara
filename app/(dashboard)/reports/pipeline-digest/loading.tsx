import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-3 sm:p-6 space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="flex gap-2 flex-wrap">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-24" />)}
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}
