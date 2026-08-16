import type { ChampionInfo } from "@/lib/ddragon";
import type { MatchEntry } from "@/lib/loaders/matches";
import { MatchRow, type MatchRowNotes } from "@/components/match-row";

// The history list itself — /matches and /demo/matches.
//
// What this exists for is the mapping below, which turns a participant row plus
// its match into MatchRowData. It is mechanical, and it has to name every column
// MatchRow renders; two copies of it drift the first time a column is added, and
// the drift shows up as a blank cell rather than as an error.
//
// `notesFor` is a slot rather than a flag. The private page hands over a
// function that builds each row's note thread; the demo hands over nothing, and
// the rows render non-expandable (see MatchRowShell). Passing a notes map plus a
// `demo` boolean would leave the public list one forgotten branch away from
// publishing somebody's review notes.
export function MatchesList({
  entries,
  version,
  championMap,
  showPlayerName,
  notesFor,
}: {
  entries: MatchEntry[];
  version: string;
  championMap: Map<number, ChampionInfo>;
  /** Whose game each row is — off when the list is already one player's history. */
  showPlayerName: boolean;
  notesFor?: (entry: MatchEntry) => MatchRowNotes;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-grey-mid">No tracked matches yet.</p>;
  }

  return (
    <>
      {entries.map((entry) => {
        const { match, viewer, opponent, allies, enemies, player } = entry;
        return (
          <MatchRow
            key={viewer.id}
            match={{
              riotMatchId: match.riot_match_id,
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
              gameCreation: match.game_creation,
              gameDurationSeconds: match.game_duration_seconds,
              opponent,
              allies,
              enemies,
            }}
            version={version}
            championMap={championMap}
            notes={notesFor?.(entry)}
            playerName={showPlayerName ? player?.display_name : undefined}
          />
        );
      })}
    </>
  );
}
