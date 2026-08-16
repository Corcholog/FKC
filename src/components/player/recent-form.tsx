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
// Shared between the private page and the demo, and `notes` is the whole
// difference. Privately it carries the note threads plus who is allowed to write
// one; publicly it is absent, which makes each row non-expandable rather than
// expandable onto nothing (see MatchRowShell).
export function RecentForm({
  matchList,
  participantsByMatch,
  playerId,
  playerName,
  playerSlug,
  version,
  championMap,
  basePath = "",
  notes,
}: {
  matchList: MatchListRow[];
  participantsByMatch: Map<string, MatchRowParticipant[]>;
  playerId: string;
  playerName: string;
  playerSlug: string;
  version: string;
  championMap: Map<number, ChampionInfo>;
  basePath?: string;
  notes?: {
    byParticipant: Map<string, MatchNote[]>;
    canAdd: boolean;
    currentUserId: string | null;
  };
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium tracking-wide text-grey-light uppercase">Recent form</h2>
        <Link
          href={`${basePath}/matches?player=${playerSlug}`}
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

          const { allies, enemies, opponent } = matchComposition(participants, viewer);

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
            />
          );
        })
      )}
    </section>
  );
}
