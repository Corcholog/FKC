import { Skeleton } from "@/components/ui/skeleton";

export function MatchRowSkeleton() {
  return (
    <div className="panel-hex flex items-center gap-3 p-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-2.5 lg:flex">
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-8 rounded-sm" />
          ))}
        </div>
        <Skeleton className="h-3 w-4" />
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-8 rounded-sm" />
          ))}
        </div>
      </div>
      <div className="hidden w-28 shrink-0 flex-col items-end gap-1.5 sm:flex">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-10" />
      </div>
      <div className="flex w-24 shrink-0 flex-col items-end gap-1.5">
        <Skeleton className="h-3.5 w-10" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  );
}
