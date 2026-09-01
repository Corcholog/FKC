import Link from "next/link";
import type { ChampionInfo } from "@/lib/ddragon";
import type { MatchNote } from "@/lib/match-notes";
import type { MatchListRow } from "@/lib/loaders/player";
import {
  matchComposition,
  type MatchRowParticipant,
} from "@/lib/match-rows";
import { MatchRow } from "@/components/match-row";

// The last few games, on a player's own page.
//
// `notes` carries the note threads plus who is allowed to write one. Absent, it
// makes each row non-expandable rather than expandable onto nothing (see
// MatchRowShell).
//
// `accountNames` labels each row with the account that played it, and only for
// somebody who has more than one — which is exactly the page where the label is
// worth the pixels, since the whole history folds several accounts together.
export function RecentForm({
  matchList,
  participantsByMatch,
  playerId,
  playerName,
  playerSlug,
  version,
  championMap,
  notes,
  accountNames,
}: {
  matchList: MatchListRow[];
  participantsByMatch: Map<string, MatchRowParticipant[]>;
  playerId: string;
  playerName: string;
  playerSlug: string;
  version: string;
  championMap: Map<number, ChampionInfo>;
  notes?: {
    byParticipant: Map<string, MatchNote[]>;
    canAdd: boolean;
    currentUserId: string | null;
  };
  /** puuid → Riot ID, for anybody with more than one account. */
  accountNames?: Map<string, string>;
}) {
  return (
    // bleed-wide: the rows need more width than this page's reading column
    // gives them, and widening the column would stretch the champion pool and
    // the matchup tables with it. The width itself is --row-width-player in
    // globals.css, deliberately narrower than /matches gives itself — this is a
    // five-row preview inside a profile, not the full history page.
    <section className="bleed-wide [--bleed-width:var(--row-width-player)] flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium tracking-wide text-grey-light uppercase">Recent form</h2>
        <Link
          href={`/matches?player=${playerSlug}`}
          className="text-xs text-gold-bright hover:underline"
        >
          View full history →
        </Link>
      </div>

      {matchList.length === 0 ? (
        <p className="text-sm text-grey-mid">No tracked matches yet.</p>
      ) : (
        matchList.map((m) => {
          const participants = participantsByMatch.get(m.id) ?? [];
          const viewer = participants.find((p) => p.player_id === playerId);
          if (!viewer) return null;

          const { allies, enemies, opponent, award } = matchComposition(participants, viewer);

          return (
            <MatchRow
              key={viewer.id}
              match={{
                riotMatchId: m.riot_match_id ?? null,
                championId: viewer.champion_id,
                championName: viewer.champion_name,
                win: viewer.win,
                kills: viewer.kills,
                deaths: viewer.deaths,
                assists: viewer.assists,
                damageDealtToChampions: viewer.damage_dealt_to_champions,
                totalCs: viewer.total_cs,
                teamPosition: viewer.team_position,
                visionScore: viewer.vision_score,
                performanceScore: viewer.performance_score,
                award,
                gameCreation: m.game_creation,
                gameDurationSeconds: m.game_duration_seconds,
                opponent,
                allies,
                enemies,
              }}
              version={version}
              championMap={championMap}
              notes={
                notes
                  ? {
                      participantId: viewer.id,
                      playerId,
                      ownerName: playerName,
                      items: notes.byParticipant.get(viewer.id) ?? [],
                      canAdd: notes.canAdd,
                      currentUserId: notes.currentUserId,
                    }
                  : undefined
              }
              accountName={accountNames?.get(viewer.puuid)}
            />
          );
        })
      )}
    </section>
  );
}
