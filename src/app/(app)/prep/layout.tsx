import { PrepTabs } from "@/components/prep/prep-tabs";

// Everything you look at before a game rather than after it: champion notes,
// counters, saved comps, tier lists, and our own record of what we drafted and
// who we drafted it against.
//
// Wider than the rest of the app's max-w-6xl, and the simulator is why: it puts
// five pick slots on each flank of a champion grid, and the reference panel adds
// a 30rem column beside the board when it's open. At 80rem the board had about
// 46rem left, which is fewer champion columns than the picker is worth. Below
// 96rem this is a no-op, so the only screens it changes are the ones that had
// the room going spare.
export default function PrepLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-[96rem] flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-white">Prep</h1>
        <p className="text-sm text-grey-light">
          Champion notes, counters and saved comps, a board to draft against them, and what
          we have actually picked and banned against the teams we play.
        </p>
      </div>

      <PrepTabs />

      {children}
    </main>
  );
}
