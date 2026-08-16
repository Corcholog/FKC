"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// The demo's own boundary. /demo is a sibling of the (app) route group, so
// (app)/error.tsx does not cover it — without this file a failed read here falls
// through to Next's default error page, which is a bare "Application error" with
// no styling and no retry.
//
// That matters more here than in the private app, because this is the page sent
// to someone being pitched. Whatever goes wrong, it should look like a product
// having a bad moment rather than a broken link.
//
// Copy is deliberately vaguer than the private version: a stranger has no nav to
// fall back to and no idea what a sync is.
export default function DemoError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Demo page render failed:", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center sm:px-6">
      <AlertTriangle className="size-8 text-[var(--color-warning)]" aria-hidden />

      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-xl font-semibold text-[var(--color-white)]">
          Couldn&rsquo;t load the demo data
        </h1>
        <p className="text-sm text-[var(--color-grey-light)]">
          This is usually momentary. Try again in a second.
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
