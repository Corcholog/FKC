import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MatchRowSkeleton } from "@/components/match-row-skeleton";

function RosterRowSkeleton() {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
      <Skeleton className="h-3.5 flex-1" />
      <Skeleton className="h-4 w-14 rounded-full" />
      <Skeleton className="h-3 w-8" />
    </div>
  );
}

// max-w-6xl and gap-8 to match (app)/page.tsx exactly. They had drifted to
// 7xl/6 here, so the whole dashboard visibly reflowed — wider, then narrower —
// at the moment the data arrived.
export default function DashboardLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="panel-hex panel-hex-clip py-5">
                <CardContent className="flex flex-col items-center gap-2">
                  <Skeleton className="h-8 w-12" />
                  <Skeleton className="h-3 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-28" />
            {Array.from({ length: 5 }).map((_, i) => (
              <MatchRowSkeleton key={i} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <Skeleton className="h-3 w-16" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded-lg" />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-3 w-24" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-5 w-28 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-3 w-14" />
            </CardHeader>
            <CardContent className="flex flex-col gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <RosterRowSkeleton key={i} />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
