import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-3 sm:p-6 space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-20" />)}
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}
      </div>
      <div className="rounded-lg border overflow-hidden">
        <Skeleton className="h-10 w-full" />
        {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-12 w-full border-t" />)}
      </div>
    </div>
  );
}
