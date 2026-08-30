import { TeamMatchTabs } from "@/components/team/team-match-tabs";

// The private layout's twin, minus the "New series" button.
//
// Not the same file with the button hidden behind a flag: that button is the
// entry point to the whole write path, and a layout wraps every page under it,
// so a flag here is the single worst place in the section to get one wrong.
export default function DemoTeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-white">Team</h1>
        <p className="text-sm text-grey-light">
          Every game played as a team — scrims, friendlies and tournament officials.
          Opponent names are replaced; their drafts and results are real.
        </p>
      </div>

      <TeamMatchTabs basePath="/demo" />

      {children}
    </main>
  );
}
