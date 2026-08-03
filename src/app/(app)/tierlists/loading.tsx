import { Skeleton } from "@/components/ui/skeleton";

function BoardSkeleton() {
  return (
    <div className="panel-hex overflow-hidden">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-stretch border-b border-border last:border-b-0">
          <Skeleton className="h-17 w-14 rounded-none sm:w-24" />
          <div className="flex flex-1 flex-wrap gap-1 bg-bg-secondary p-1.5">
            {Array.from({ length: 5 - i }).map((_, j) => (
              <Skeleton key={j} className="h-14 w-14 rounded-sm" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TierListsLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-72" />
      </div>

      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="ml-auto h-7 w-40 rounded-lg" />
          </div>
          <BoardSkeleton />
        </div>
      ))}
    </main>
  );
}
