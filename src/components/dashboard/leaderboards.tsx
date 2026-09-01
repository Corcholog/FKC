import type { Dashboard } from "@/lib/loaders/dashboard";
import { AwardTile } from "@/components/award-tile";
import { Card, CardContent } from "@/components/ui/card";

// Who is best and worst at what — the body of /soloq.
//
// It used to be the whole of a dashboard, alongside a squad list and an activity
// feed. Both of those became pages of their own (/players and
// /matches?view=soloq); having them in three places meant three definitions of
// "recent" and "the roster". What was left is the awards, which nothing else
// computes.
export function Leaderboards({ dashboard }: { dashboard: Dashboard }) {
  const { gamesThisWeek, groupWinRate, mostActive, hallOfFame, hallOfShame } = dashboard;

  return (
    <section className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-3">
        <Card className="panel-hex panel-hex-clip py-5">
          <CardContent className="flex flex-col items-center gap-1 text-center">
            <p className="font-heading tabular-nums text-3xl font-semibold text-white">
              {gamesThisWeek}
            </p>
            <p className="text-xs text-grey-light">Games this week</p>
          </CardContent>
        </Card>
        <Card className="panel-hex panel-hex-clip py-5">
          <CardContent className="flex flex-col items-center gap-1 text-center">
            <p className="font-heading tabular-nums text-3xl font-semibold text-white">
              {groupWinRate === null ? "—" : `${groupWinRate}%`}
            </p>
            <p className="text-xs text-grey-light">SoloQ winrate</p>
          </CardContent>
        </Card>
        <Card className="panel-hex panel-hex-clip py-5">
          <CardContent className="flex flex-col items-center gap-1 text-center">
            <p className="truncate font-heading text-3xl font-semibold text-white">
              {mostActive ? mostActive.player.display_name : "—"}
            </p>
            <p className="text-xs text-grey-light">
              {mostActive ? `Most active (${mostActive.games} this week)` : "No games this week"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Both halls share a column count so the tiles line up as one block
          across the two headings, even when they hold different counts. */}
      {[
        { heading: "Hall of fame", specs: hallOfFame },
        { heading: "Hall of shame", specs: hallOfShame },
      ].map(({ heading, specs }) => (
        <section key={heading} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium tracking-wide text-grey-light uppercase">
            {heading}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {specs.map(({ label, tone, ranking, format, sub, metric }) => {
              const leader = ranking[0] ?? null;

              return (
                <AwardTile
                  key={label}
                  label={label}
                  tone={tone}
                  player={leader?.player ?? null}
                  value={leader ? format(leader.value) : ""}
                  sub={leader ? sub(leader.games) : undefined}
                  metric={metric}
                  ranking={ranking.map(({ player, value, games }) => ({
                    id: player.id,
                    name: player.display_name,
                    avatarUrl: player.avatar_url,
                    href: `/players/${player.slug}`,
                    value: format(value),
                    sub: sub(games),
                  }))}
                />
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}
