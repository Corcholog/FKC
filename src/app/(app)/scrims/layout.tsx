import Link from "next/link";
import { Plus } from "lucide-react";
// A Link styled as a button, not a Button rendering a Link — base-ui's Button
// wants a real <button> underneath. Same approach as tierlists/page.tsx.
import { buttonVariants } from "@/components/ui/button";
import { ScrimTabs } from "@/components/scrims/scrim-tabs";
import { cn } from "@/lib/utils";

export default function ScrimsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-white">Scrims</h1>
          <p className="text-sm text-grey-light">
            Tournament and practice games, entered by hand — Riot&apos;s API doesn&apos;t serve
            custom games.
          </p>
        </div>
        <Link href="/scrims/new" className={cn(buttonVariants({ size: "sm" }))}>
          <Plus />
          New scrim
        </Link>
      </div>

      <ScrimTabs />

      {children}
    </main>
  );
}
