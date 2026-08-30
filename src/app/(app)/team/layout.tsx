import Link from "next/link";
import { Plus } from "lucide-react";
// A Link styled as a button, not a Button rendering a Link — base-ui's Button
// wants a real <button> underneath. Same approach as tierlists/page.tsx.
import { buttonVariants } from "@/components/ui/button";
import { TeamMatchTabs } from "@/components/team/team-match-tabs";
import { cn } from "@/lib/utils";

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-white">Team</h1>
          <p className="text-sm text-grey-light">
            Every game played as a team. Scrims, friendlies and tournament officials are
            entered by hand or read out of a replay, because Riot&apos;s API doesn&apos;t
            serve custom games; ranked flex comes from the API and sits beside them in the
            match history, one row per game rather than one per player.
          </p>
        </div>
        <Link href="/team/matches/new" className={cn(buttonVariants({ size: "sm" }))}>
          <Plus />
          New series
        </Link>
      </div>

      <TeamMatchTabs />

      {children}
    </main>
  );
}
