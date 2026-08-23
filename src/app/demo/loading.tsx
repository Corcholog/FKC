import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MatchRowSkeleton } from "@/components/match-row-skeleton";

// Same skeleton as `/`, because /demo renders the same dashboard — minus the
// sync card, which the public page has no counterpart for.
//
// It does two jobs, and the second one is the surprising one. The obvious job is
// the cold load: the first request after the data cache expires costs about a
// second against Supabase, and a public link should show a shape rather than
// nothing.
//
// The other job is that **loading.tsx is what makes error.tsx work here.** It
// wraps the segment in a Suspense boundary, and without one an error thrown
// while rendering the page has nowhere to be recovered to — Next gives up on the
// whole route and serves its own bare 500 page instead of demo/error.tsx.
// Verified by simulating a failed read with and without this file.
//
// That second job is also why this file covers the whole subtree: a demo route
// with no loading.tsx of its own falls back to this one. /demo/team has its own
// because its shape is nothing like this; the rest borrow the dashboard's.
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

export default function DemoLoading() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-full max-w-2xl" />
        <Skeleton className="h-4 w-3/4 max-w-xl" />
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
