import Image from "next/image";
import {
  formatDuration,
  formatKDA,
  formatKdaRatio,
  formatKillParticipation,
  formatPerMinute,
  formatRelativeTime,
  kdaRatioForGame,
} from "@/lib/format";
import { championDisplayName, championIconUrl, type ChampionInfo } from "@/lib/ddragon";
import { leagueOfGraphsMatchUrl } from "@/lib/match-links";
import type { MatchNote } from "@/lib/match-notes";
import { isSupport } from "@/lib/roles";
import { MatchRowShell } from "@/components/match-row-shell";
import { NotesSection } from "@/components/notes-section";

export type TeamComposChampion = {
  championId: number;
  championName: string;
  kills: number;
  isSelf?: boolean;
};

type MatchRowData = {
  riotMatchId: string;
  championId: number;
  championName: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  damageDealtToChampions: number;
  totalCs: number;
  /** Riot's raw team_position — decides whether the row leads with CS or vision. */
  teamPosition: string | null;
  /** Null on games synced before migration 005, which have no vision score at all. */
  visionScore: number | null;
  gameCreation: string;
  gameDurationSeconds: number;
  opponent: TeamComposChampion | null;
  allies: TeamComposChampion[];
  enemies: TeamComposChampion[];
};

/** Everything the row's notes panel needs — grouped so the row doesn't take
 * six loose props for one feature. */
export type MatchRowNotes = {
  /** The match_participants row the notes hang off: this player, this game. */
  participantId: string;
  playerId: string;
  /** Display name of the player whose game this is — the only one who can write. */
  ownerName: string;
  items: MatchNote[];
  canAdd: boolean;
  currentUserId: string | null;
};

function TeamComposRow({
  champions,
  version,
  championMap,
}: {
  champions: TeamComposChampion[];
  version: string;
  championMap: Map<number, ChampionInfo>;
}) {
  return (
    <div className="flex gap-1">
      {champions.map((c, i) => {
        const url = championIconUrl(c.championId, version, championMap);
        const name = championDisplayName(c.championId, championMap, c.championName);
        return url ? (
          // eslint-disable-next-line @next/next/no-img-element -- tiny decorative icons, next/image overhead isn't worth it here
          <img
            key={i}
            src={url}
            alt={name}
            title={name}
            className={`h-8 w-8 rounded-sm ${c.isSelf ? "ring-2 ring-gold" : ""}`}
          />
        ) : (
          <div key={i} className="h-8 w-8 rounded-sm bg-gold-muted" />
        );
      })}
    </div>
  );
}

export function MatchRow({
  match,
  version,
  championMap,
  notes,
  playerName,
}: {
  match: MatchRowData;
  version: string;
  championMap: Map<number, ChampionInfo>;
  notes: MatchRowNotes;
  /** Shown above the champion name when this row appears outside a single
   * player's own page (e.g. a squad-wide feed) so it's clear whose game it is. */
  playerName?: string;
}) {
  const iconUrl = championIconUrl(match.championId, version, championMap);
  const displayName = championDisplayName(match.championId, championMap, match.championName);
  const opponentIconUrl = match.opponent ? championIconUrl(match.opponent.championId, version, championMap) : null;
  const opponentName = match.opponent
    ? championDisplayName(match.opponent.championId, championMap, match.opponent.championName)
    : null;
  const teamKills = match.allies.reduce((sum, c) => sum + c.kills, 0);
  const supportRow = isSupport(match.teamPosition);

  return (
    <MatchRowShell
      win={match.win}
      noteCount={notes.items.length}
      panel={
        <NotesSection
          matchParticipantId={notes.participantId}
          playerId={notes.playerId}
          playerName={notes.ownerName}
          notes={notes.items}
          canAddNote={notes.canAdd}
          currentUserId={notes.currentUserId}
          matchInfoUrl={leagueOfGraphsMatchUrl(match.riotMatchId)}
        />
      }
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {iconUrl ? (
          <Image src={iconUrl} alt={displayName} width={40} height={40} className="h-10 w-10 shrink-0 rounded-md" />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-md bg-gold-muted" />
        )}
        <div className="min-w-0">
          {playerName && (
            <p className="truncate text-[10px] font-medium tracking-wide text-gold-bright uppercase">{playerName}</p>
          )}
          <p className="truncate text-sm font-medium text-white">{displayName}</p>
          <p className="tabular-nums text-xs text-grey-light">
            {formatKDA(match.kills, match.deaths, match.assists)} ({formatKdaRatio(
              kdaRatioForGame(match.kills, match.deaths, match.assists),
            )} KDA) - {" "}
            {formatKillParticipation(match.kills, match.assists, teamKills)} KP
          </p>
        </div>
      </div>

      {/* Compact opponent hint when the row itself doesn't have room for the
          full team comps below — a container query, not a viewport
          breakpoint, since this row can end up inside a narrower grid column
          (e.g. the dashboard's 2-column layout) even on a wide screen. */}
      <div className="flex w-16 shrink-0 flex-row items-center justify-center gap-1.5 @[800px]:hidden">
        <span className="text-xs font-medium tracking-wide text-grey-mid uppercase">vs</span>
        {opponentIconUrl ? (
          <img src={opponentIconUrl} alt={opponentName ?? ""} title={opponentName ?? ""} className="h-7 w-7 rounded-sm" />
        ) : (
          <div className="h-7 w-7 rounded-sm bg-gold-muted" />
        )}
      </div>

      {/* Full team comps once the row itself has room — allies centered on the
          left, enemies on the right, so the ally/enemy split reads at a
          glance instead of stacking two rows. Replaces the "vs" hint above,
          not alongside it. */}
      <div className="hidden shrink-0 items-center gap-2.5 @[800px]:flex">
        <TeamComposRow champions={match.allies} version={version} championMap={championMap} />
        <span className="text-[10px] font-semibold tracking-wide text-grey-mid uppercase">vs</span>
        <TeamComposRow champions={match.enemies} version={version} championMap={championMap} />
      </div>

      <div className="hidden w-28 shrink-0 text-right text-xs text-grey-light @[420px]:block">
        {/* Supports don't farm, so CS/min on their rows is a number nobody can
            do anything with — the same reason support games are kept out of the
            CS awards entirely. Vision is the stat that lane is actually judged
            on. A support game synced before migration 005 has no vision score
            to show, and says so rather than falling back to the CS it replaced. */}
        <p className="tabular-nums">
          {supportRow ? (
            <>
              {match.visionScore === null
                ? "—"
                : formatPerMinute(match.visionScore, match.gameDurationSeconds)}{" "}
              vision/min
            </>
          ) : (
            <>{formatPerMinute(match.totalCs, match.gameDurationSeconds)} CS/min</>
          )}
        </p>
        <p className="tabular-nums">
          {formatPerMinute(match.damageDealtToChampions, match.gameDurationSeconds)} dmg/min
        </p>
        <p className="tabular-nums">{formatDuration(match.gameDurationSeconds)}</p>
      </div>

      <div className="w-24 shrink-0 text-right">
        <p className={`text-sm font-semibold ${match.win ? "text-win" : "text-loss"}`}>
          {match.win ? "Win" : "Loss"}
        </p>
        <p className="text-xs text-grey-mid">{formatRelativeTime(match.gameCreation)}</p>
      </div>
    </MatchRowShell>
  );
}
