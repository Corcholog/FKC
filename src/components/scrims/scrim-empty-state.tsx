import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shown by every scrim page while nothing has been entered.
 *
 * It explains *why* there's a form here at all rather than a sync button —
 * everywhere else in this app data appears on its own, so an empty page with no
 * explanation reads as "the sync is broken", not "nobody has typed a game in".
 */
export function ScrimEmptyState({ what = "No scrims recorded yet." }: { what?: string }) {
  return (
    <div className="panel-hex flex flex-col items-center gap-3 p-10 text-center">
      <p className="text-sm text-grey-light">{what}</p>
      <p className="max-w-md text-xs text-grey-mid">
        Custom games can&apos;t be fetched from Riot — match-v5 dropped them, and the two endpoints
        that carry them both need an approved production key. So drafts get typed in after the
        block. It takes a couple of minutes a game.
      </p>
      <Link href="/scrims/new" className={cn(buttonVariants({ size: "sm" }), "mt-1")}>
        <Plus />
        Add a series
      </Link>
    </div>
  );
}
