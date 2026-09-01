import { SettingsTabs } from "@/components/settings/settings-tabs";

// The section shell: heading and tabs, so no page below repeats them.
//
// max-w-4xl rather than the 3xl this page used as one column — the roster tab
// carries a player row per person, each with its own account list, and the
// per-account controls were the first thing to wrap.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-grey-light">
          The roster, the main team, and everything the sync and the AI run on.
        </p>
      </div>

      <SettingsTabs />

      {children}
    </main>
  );
}
