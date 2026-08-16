import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

// Same skeleton as /team, because /demo renders the same cards.
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

export default function DemoLoading() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-full max-w-2xl" />
        <Skeleton className="h-4 w-3/4 max-w-xl" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <PlayerCardSkeleton key={i} />
        ))}
      </div>
    </main>
  );
}
