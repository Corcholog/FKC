import { DraftTabs } from "@/components/draft/draft-tabs";

// Wider than scrims' max-w-6xl: the simulator puts five pick slots on each flank
// of a champion grid and needs the room. It went past max-w-7xl when the
// reference panel arrived — that's a 30rem column beside the board when it's
// open, and at 80rem the board had about 46rem left, which is fewer champion
// columns than the picker is worth. Below 96rem this is a no-op, so the only
// screens it changes are the ones that had the room going spare.
//
// No header action button like scrims/new — there's no single "new" thing to
// create here.
export default function DraftLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-[96rem] flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-white">Draft</h1>
        <p className="text-sm text-grey-light">
          Champion notes, counters, saved comps, and a board to draft against them.
        </p>
      </div>

      <DraftTabs />

      {children}
    </main>
  );
}
