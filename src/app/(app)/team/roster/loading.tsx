import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

function PlayerCardSkeleton() {
  return (
    <Card className="panel-hex-clip gap-3 border-2 border-border">
      <div className="flex items-center gap-4 px-4">
        <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-20 rounded-full" />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex flex-col items-end gap-1.5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-10" />
          </div>
          <Skeleton className="h-14 w-14 rounded-full" />
        </div>
      </div>
      <div className="flex gap-1.5 border-t border-border px-4 pt-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 flex-1 rounded-lg" />
        ))}
      </div>
    </Card>
  );
}

export default function TeamLoading() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <PlayerCardSkeleton key={i} />
        ))}
      </div>
    </main>
  );
}
