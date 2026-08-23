import Link from "next/link";
import { BarChart3, ChevronRight, LineChart, Swords, Users } from "lucide-react";
import type { Dashboard } from "@/lib/loaders/dashboard";
import type { MatchEntry } from "@/lib/loaders/matches";
import type { ChampionInfo } from "@/lib/ddragon";
import { avatarTint } from "@/lib/avatar-tint";
import { formatWinRate } from "@/lib/rank";
import { formatStreak, NOTABLE_STREAK } from "@/lib/streaks";
import { AwardTile } from "@/components/award-tile";
import { MatchesList } from "@/components/matches-list";
import type { MatchRowNotes } from "@/components/match-row";
import { RankBadge } from "@/components/rank-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// The dashboard itself — `/` and `/demo` render this, against the same loader
// pointed at different tables.
//
// Everything the demo must not show is a slot rather than a flag, the rule
// documented in 07-frontend.md §14: the private page passes a sync card, a
// recap and a notes builder; the demo passes none of the three and the markup
// for them does not exist on that render. `canEdit={false}` would put the unsafe
// branch in here, where it renders unless somebody remembers the prop.

function QuickLinkRow({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Users;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-white transition-colors hover:bg-bg-tertiary"
    >
      <Icon className="h-4 w-4 shrink-0 text-gold" />
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-grey-mid" />
    </Link>
  );
}

export function DashboardView({
  dashboard,
  version,
  championMap,
  basePath = "",
  intro,
  syncStatus,
  recap,
  notesFor,
}: {
  dashboard: Dashboard;
  version: string;
  championMap: Map<number, ChampionInfo>;
  /** "" in the private app, "/demo" in the public one — where every link goes. */
  basePath?: string;
  /** The heading block. Each version says what it is in its own words. */
  intro: React.ReactNode;
  /** The sync card. Private only — the demo has no business reading `sync_state`. */
  syncStatus?: React.ReactNode;
  /**
   * The clan recap. Both versions pass one, but they are different rows written
   * in different voices: nightly from `team_ai_summary` on the private side,
   * published by hand out of `demo_text` on the public one.
   */
  recap?: React.ReactNode;
  /** Builds one row's note thread. Omitted on the demo, which renders rows collapsed. */
  notesFor?: (entry: MatchEntry) => MatchRowNotes;
}) {
  const { roster, gamesThisWeek, groupWinRate, mostActive, streaks, hallOfFame, hallOfShame } =
    dashboard;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      {intro}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="flex flex-col gap-6 lg:col-span-3">
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
                <p className="text-xs text-grey-light">Team winrate</p>
              </CardContent>
            </Card>
            <Card className="panel-hex panel-hex-clip py-5">
              <CardContent className="flex flex-col items-center gap-1 text-center">
                <p className="truncate font-heading text-3xl font-semibold text-white">
                  {mostActive ? mostActive.player.display_name : "—"}
                </p>
                <p className="text-xs text-grey-light">
                  {mostActive
                    ? `Most active (${mostActive.games} this week)`
                    : "No games this week"}
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
              <h2 className="text-sm font-medium tracking-wide text-grey-light uppercase">
                {heading}
              </h2>
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
                        href: `${basePath}/player/${player.slug}`,
                        value: format(value),
                        sub: sub(games),
                      }))}
                    />
                  );
                })}
              </div>
            </section>
          ))}

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium tracking-wide text-grey-light uppercase">
              Recent activity
            </h2>
            <MatchesList
              entries={dashboard.activity}
              version={version}
              championMap={championMap}
              showPlayerName
              notesFor={notesFor}
            />
          </section>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-xs tracking-wide text-grey-light uppercase">
                Browse
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-0.5">
              <QuickLinkRow href={`${basePath}/team`} icon={Users} label="Team" />
              <QuickLinkRow href={`${basePath}/matches`} icon={Swords} label="Matches" />
              <QuickLinkRow href={`${basePath}/champions`} icon={BarChart3} label="Champions" />
              <QuickLinkRow href={`${basePath}/insights`} icon={LineChart} label="Insights" />
            </CardContent>
          </Card>

          {syncStatus}

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-xs tracking-wide text-grey-light uppercase">
                Squad
              </CardTitle>
              <CardAction>
                <Link href={`${basePath}/team`} className="text-xs text-gold-bright hover:underline">
                  View team →
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-0.5">
              {roster.length === 0 ? (
                <p className="text-sm text-grey-mid">No players tracked yet.</p>
              ) : (
                roster.map((p) => {
                  const streak = streaks.get(p.id);
                  const streakLabel = streak ? formatStreak(streak) : null;
                  const onFire = (streak?.current ?? 0) >= NOTABLE_STREAK;

                  return (
                    <Link
                      key={p.id}
                      href={`${basePath}/player/${p.slug}`}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-bg-tertiary"
                    >
                      <Avatar size="sm">
                        {p.avatar_url && <AvatarImage src={p.avatar_url} alt="" />}
                        <AvatarFallback
                          className="text-[10px]"
                          style={avatarTint(p.display_name)}
                        >
                          {p.display_name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <p className="min-w-0 flex-1 truncate text-sm text-white">{p.display_name}</p>
                      {/* Only rendered once a streak is long enough to be worth
                          mentioning — see NOTABLE_STREAK. */}
                      {streakLabel && (
                        <span
                          title={streakLabel}
                          className={`shrink-0 text-xs ${onFire ? "text-win" : "text-loss"}`}
                        >
                          {onFire ? "🔥" : "😈"}
                        </span>
                      )}
                      <RankBadge tier={p.tier} division={p.division} size="sm" />
                      <span className="shrink-0 text-xs tabular-nums text-grey-light">
                        {formatWinRate(p.wins, p.losses)}
                      </span>
                    </Link>
                  );
                })
              )}
            </CardContent>
          </Card>

          {recap}
        </div>
      </div>
    </main>
  );
}
