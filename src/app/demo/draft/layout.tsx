import { DraftTabs } from "@/components/draft/draft-tabs";

// The private layout's twin. It carries no action button, so unlike the scrims
// shell there is nothing here to leave out — only the tab prefix changes.
export default function DemoDraftLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-[96rem] flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-white">Draft</h1>
        <p className="text-sm text-grey-light">
          Champion notes, counters, saved comps, and a board to draft against them. The board is
          live — drafting on it changes nothing on the server, so try it.
        </p>
      </div>

      <DraftTabs basePath="/demo" />

      {children}
    </main>
  );
}
