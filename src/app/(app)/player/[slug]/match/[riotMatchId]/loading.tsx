import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function ParticipantRowSkeleton() {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
      <Skeleton className="h-3 min-w-0 flex-1" />
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-3 w-14" />
      <Skeleton className="h-3 w-10" />
    </div>
  );
}

function TeamCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-3 w-14" />
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <ParticipantRowSkeleton key={i} />
        ))}
      </CardContent>
    </Card>
  );
}

export default function MatchDetailLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-8 sm:px-6">
      <Skeleton className="h-4 w-16" />

      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-3 w-32" />
      </div>

      <TeamCardSkeleton />
      <TeamCardSkeleton />

      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    </main>
  );
}
