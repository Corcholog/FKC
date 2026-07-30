import {
  CHALLENGE_KEYS,
  PING_FIELDS,
  type MatchParticipantDto,
  type PingField,
} from "@/lib/riot";

// Maps one participant from Riot's match DTO onto a match_participants row.
// Lives outside sync.ts because the settings backfill action writes the same
// shape into existing rows — two mappings would drift the moment a column is
// added on one side only.

// Riot has shipped patches where a participant field simply stops appearing.
// Writing `undefined` into a Supabase insert drops the key entirely (leaving a
// stale value on an update), so every optional read is normalised to null.
function num(value: number | undefined): number | null {
  return typeof value === "number" ? value : null;
}

function bool(value: boolean | undefined): boolean | null {
  return typeof value === "boolean" ? value : null;
}

// Whatever ping counters this patch actually returned. Null rather than {} when
// none are present, so "Riot stopped sending pings" reads differently from
// "nobody pinged".
function pickPings(p: MatchParticipantDto): Record<string, number> | null {
  const pings: Record<string, number> = {};
  for (const field of PING_FIELDS) {
    const value = p[field as PingField];
    if (typeof value === "number") pings[field] = value;
  }
  return Object.keys(pings).length > 0 ? pings : null;
}

// The CHALLENGE_KEYS slice only — see the comment on that constant for why the
// full object isn't stored.
function pickChallenges(p: MatchParticipantDto): Record<string, number | boolean> | null {
  if (!p.challenges) return null;

  const picked: Record<string, number | boolean> = {};
  for (const key of CHALLENGE_KEYS) {
    const value = p.challenges[key];
    if (typeof value === "number" || typeof value === "boolean") picked[key] = value;
  }
  return Object.keys(picked).length > 0 ? picked : null;
}

// The columns that describe *what happened* in the game, as opposed to who and
// where — split out because the backfill updates exactly these and must not
// touch match_id, puuid or player_id on an existing row.
export function participantStatColumns(p: MatchParticipantDto) {
  return {
    team_id: p.teamId,
    team_position: p.teamPosition || null,
    champion_id: p.championId,
    champion_name: p.championName,
    win: p.win,

    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    damage_dealt_to_champions: p.totalDamageDealtToChampions,
    gold_earned: p.goldEarned,
    total_minions_killed: p.totalMinionsKilled,
    neutral_minions_killed: p.neutralMinionsKilled,

    vision_score: num(p.visionScore),
    wards_placed: num(p.wardsPlaced),
    wards_killed: num(p.wardsKilled),
    detector_wards_placed: num(p.detectorWardsPlaced),

    total_damage_taken: num(p.totalDamageTaken),
    damage_self_mitigated: num(p.damageSelfMitigated),
    total_heals_on_teammates: num(p.totalHealsOnTeammates),
    total_damage_shielded_on_teammates: num(p.totalDamageShieldedOnTeammates),
    time_ccing_others: num(p.timeCCingOthers),

    turret_takedowns: num(p.turretTakedowns),
    dragon_takedowns: num(p.dragonTakedowns),
    baron_takedowns: num(p.baronTakedowns),
    inhibitor_takedowns: num(p.inhibitorTakedowns),
    objectives_stolen: num(p.objectivesStolen),

    first_blood_kill: bool(p.firstBloodKill),
    first_blood_assist: bool(p.firstBloodAssist),
    double_kills: num(p.doubleKills),
    triple_kills: num(p.tripleKills),
    quadra_kills: num(p.quadraKills),
    penta_kills: num(p.pentaKills),

    total_time_spent_dead: num(p.totalTimeSpentDead),
    longest_time_spent_living: num(p.longestTimeSpentLiving),

    champ_level: num(p.champLevel),
    // Slot order matters (index 6 is the trinket), so gaps stay as 0 — Riot's
    // own representation of an empty slot — rather than being filtered out.
    items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].map((i) => i ?? 0),
    summoner1_id: num(p.summoner1Id),
    summoner2_id: num(p.summoner2Id),

    pings: pickPings(p),
    challenges: pickChallenges(p),
  };
}

// A complete new row, for the sync's insert path.
export function toParticipantRow(
  p: MatchParticipantDto,
  { matchId, isTracked }: { matchId: string; isTracked: boolean },
) {
  return {
    match_id: matchId,
    player_id: isTracked ? p.puuid : null,
    puuid: p.puuid,
    riot_game_name: p.riotIdGameName ?? null,
    riot_tag_line: p.riotIdTagline ?? null,
    ...participantStatColumns(p),
  };
}
