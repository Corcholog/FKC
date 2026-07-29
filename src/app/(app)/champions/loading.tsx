import { Skeleton } from "@/components/ui/skeleton";

function TierCardSkeleton() {
  return (
    <div className="panel-hex flex flex-col items-center gap-1.5 p-4">
      <Skeleton className="h-14 w-14 rounded-lg" />
      <Skeleton className="h-3.5 w-16" />
      <Skeleton className="h-5 w-10" />
      <Skeleton className="h-3 w-14" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export default function ChampionsLoading() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-44 rounded-lg" />
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-7 w-40 self-end" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <TierCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </main>
  );
}
