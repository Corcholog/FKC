"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Catches anything thrown while rendering a page inside (app). It sits below
// (app)/layout.tsx, so the navbar and the key banner survive — a failed page
// still leaves you somewhere to navigate from. A layout-level failure needs
// global-error.tsx instead.
//
// Next 16.2 note: the recovery prop is `unstable_retry`, not `reset`. They are
// different — `reset` only clears the boundary's error state and re-renders the
// same children, which for a server-rendered page means the same failure again.
// `unstable_retry` re-fetches first, which is the only one that can actually
// recover the failures this app has (a Supabase or DDragon blip).
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // No error tracker in this project (docs/engineering/10-known-gaps.md §5),
    // so the server logs are the only record. In production `error.message` is
    // a generic string and `digest` is the handle that matches the server log.
    console.error("Page render failed:", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center sm:px-6">
      <AlertTriangle className="size-8 text-[var(--color-warning)]" aria-hidden />

      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-xl font-semibold text-[var(--color-white)]">
          Something broke on this page
        </h1>
        <p className="text-sm text-[var(--color-grey-light)]">
          The rest of the app still works — try again, or pick another page from the nav.
        </p>
      </div>

      <Button onClick={() => unstable_retry()} size="lg">
        <RotateCw data-icon="inline-start" />
        Try again
      </Button>

      {error.digest ? (
        <p className="text-xs text-[var(--color-grey-mid)]">
          Error ID <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}
    </main>
  );
}
