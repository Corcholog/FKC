import Link from "next/link";
import { FULL_STACK } from "@/lib/team/roster";
import { SectionCard } from "@/components/section-card";

export type FlexAccount = {
  puuid: string;
  riot_game_name: string;
  riot_tag_line: string;
  playerName: string;
};

/**
 * Which accounts the sync walks for ranked flex.
 *
 * It lives beside the other Riot-call-budget controls because that is what it
 * is. `player_accounts.track_flex` is not a membership flag and never was — it
 * answers "is this account worth spending an id-page call on every morning".
 *
 * The zero case is the one that needs saying. Flex arrives only if some account
 * is walked for it, and nothing else in the app would report the silence: no
 * flex games looks exactly like a quiet week.
 *
 * The redundancy note is the other half. A qualifying flex game has all five of
 * the team in it, and the roster is exactly five (migration 028), so every one
 * of their accounts returns the same list of match ids — one is enough, and the
 * others spend calls to re-read it. That costs money rather than correctness,
 * which is precisely why nothing else would ever surface it.
 */
export function FlexDiscovery({ scouts }: { scouts: FlexAccount[] }) {
  return (
    <SectionCard
      title="Flex discovery"
      caption="Which accounts the sync walks for ranked flex. Toggle it per account on the Roster tab."
    >
      {scouts.length === 0 ? (
        <p className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
          No account is tracked for flex, so no flex game will ever arrive — and nothing else in
          the app would say so. Turn on FlexQ for one of the team&apos;s accounts in{" "}
          <Link href="/settings" className="underline">
            Roster
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {scouts.map((account) => (
            <li
              key={account.puuid}
              className="flex items-center justify-between gap-3 rounded-md bg-bg-tertiary px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate text-grey-light">
                {account.riot_game_name}
                <span className="text-grey-mid">#{account.riot_tag_line}</span>
              </span>
              <span className="shrink-0 text-xs text-grey-mid">{account.playerName}</span>
            </li>
          ))}
        </ul>
      )}

      {scouts.length > 1 && (
        <p className="text-xs text-grey-mid">
          Every flex game the team plays has all {FULL_STACK} of them in it, so one tracked
          account finds all of them. The other {scouts.length - 1} re-read the same list of match
          ids every run. The best one to keep is whichever account plays flex <em>only</em> with
          the team — every game that isn&apos;t theirs still costs a call to find that out.
        </p>
      )}
    </SectionCard>
  );
}
