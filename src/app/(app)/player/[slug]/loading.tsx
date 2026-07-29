import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { MatchRowSkeleton } from "@/components/match-row-skeleton";

export default function PlayerLoading() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <Card className="panel-hex panel-hex-clip">
        <CardContent className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex flex-col items-end gap-1.5">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-14 w-14 rounded-full" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-border">
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        {Array.from({ length: 5 }).map((_, i) => (
          <MatchRowSkeleton key={i} />
        ))}
      </div>
    </main>
  );
}
