export interface Team {
  id: string;
  name: string;
  tag: string;
}

export type MatchStatus = 'Scheduled' | 'Live' | 'Finished';
export type MatchStage =
  | 'Semifinal_1'
  | 'Semifinal_2'
  | 'Final'
  | 'Third_Place'
  | 'Playoff_Semi_1'
  | 'Playoff_Semi_2'
  | 'Playoff_Final';

export interface DbMatch {
  id: string;
  group_id: string | null;
  date_id: string;
  stage: MatchStage;
  team_a_id: string | null;
  team_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  status: MatchStatus;
  format: 'Bo1' | 'Bo3' | 'Bo5';
}

export interface DbGroupTeam {
  id: string;
  group_id: string;
  team_id: string | null;
  seed: number;
}

export interface DbGroup {
  id: string;
  date_id: string;
  name: string;
  group_teams: DbGroupTeam[];
  matches: DbMatch[];
}

export interface DbDate {
  id: string;
  name: string;
  sequence_order: number;
  is_locked: boolean;
  groups: DbGroup[];
}

export interface TeamPoints {
  teamId: string;
  pointsF1: number;
  pointsF2: number;
  pointsF3: number;
  totalPoints: number;
  qualified: boolean;
}

const stageOrder: Record<MatchStage, number> = {
  Semifinal_1: 1,
  Semifinal_2: 2,
  Final: 3,
  Third_Place: 4,
  Playoff_Semi_1: 1,
  Playoff_Semi_2: 2,
  Playoff_Final: 3
};

export function getRequiredWins(format: DbMatch['format']) {
  if (format === 'Bo5') return 3;
  if (format === 'Bo3') return 2;
  return 1;
}

export function isPlayoffGroup(groupName: string) {
  return groupName.toLowerCase().includes('playoff');
}

export function getMatchTitle(stage: MatchStage) {
  if (stage === 'Semifinal_1') return 'Semifinal 1';
  if (stage === 'Semifinal_2') return 'Semifinal 2';
  if (stage === 'Final') return 'Final';
  if (stage === 'Third_Place') return 'Third Place';
  if (stage === 'Playoff_Semi_1') return 'Playoff Semi 1';
  if (stage === 'Playoff_Semi_2') return 'Playoff Semi 2';
  return 'Grand Final';
}

export function getMatchStatusFromScores(match: DbMatch): MatchStatus {
  if (match.score_a === null || match.score_b === null) {
    return match.score_a !== null || match.score_b !== null ? 'Live' : 'Scheduled';
  }

  if (match.score_a === match.score_b) {
    return 'Live';
  }

  const requiredWins = getRequiredWins(match.format);
  if (match.score_a >= requiredWins || match.score_b >= requiredWins) {
    return 'Finished';
  }

  return 'Live';
}

export function getMatchWinnerId(match: DbMatch): string | null {
  if (match.status !== 'Finished' || match.score_a === null || match.score_b === null) {
    return null;
  }

  if (match.score_a > match.score_b) return match.team_a_id;
  if (match.score_b > match.score_a) return match.team_b_id;
  return null;
}

export function getMatchLoserId(match: DbMatch): string | null {
  if (match.status !== 'Finished' || match.score_a === null || match.score_b === null) {
    return null;
  }

  if (match.score_a > match.score_b) return match.team_b_id;
  if (match.score_b > match.score_a) return match.team_a_id;
  return null;
}

export function ensureGroupSlots(group: DbGroup): DbGroupTeam[] {
  const existing: Record<number, DbGroupTeam> = {};
  group.group_teams?.forEach(slot => {
    if (slot.seed >= 1 && slot.seed <= 4) {
      existing[slot.seed] = {
        ...slot,
        team_id: slot.team_id || null,
        seed: slot.seed
      };
    }
  });

  return [1, 2, 3, 4].map(seed => {
    if (existing[seed]) return existing[seed];
    return {
      id: `temp-${group.id}-${seed}`,
      group_id: group.id,
      team_id: null,
      seed
    };
  });
}

const defaultStageFormat: Record<'semis' | 'final' | 'third', DbMatch['format']> = {
  semis: 'Bo1',
  final: 'Bo1',
  third: 'Bo1'
};

export function normalizeGroupState(group: DbGroup): DbGroup {
  const slots = ensureGroupSlots(group);
  const sortedSlots = slots.sort((a, b) => a.seed - b.seed);
  const stageMap: Record<string, DbMatch> = {};
  group.matches?.forEach(match => {
    stageMap[match.stage] = {
      ...match,
      status: match.status || 'Scheduled',
      team_a_id: match.team_a_id || null,
      team_b_id: match.team_b_id || null,
      score_a: match.score_a ?? null,
      score_b: match.score_b ?? null,
      format: match.format || 'Bo1'
    };
  });

  function buildMatch(
    stage: MatchStage,
    teamA: string | null,
    teamB: string | null,
    format: DbMatch['format']
  ): DbMatch {
    const existing = stageMap[stage];
    const participantsChanged = existing
      ? existing.team_a_id !== teamA || existing.team_b_id !== teamB
      : false;

    const scoreA = participantsChanged ? null : existing?.score_a ?? null;
    const scoreB = participantsChanged ? null : existing?.score_b ?? null;
    const status = participantsChanged ? 'Scheduled' : existing?.status ?? 'Scheduled';

    return {
      id: existing?.id ?? `temp-${group.id}-${stage}`,
      group_id: group.id,
      date_id: group.date_id,
      stage,
      team_a_id: teamA,
      team_b_id: teamB,
      score_a: scoreA,
      score_b: scoreB,
      format,
      status
    };
  }

  const semi1 = buildMatch('Semifinal_1', sortedSlots[0].team_id, sortedSlots[3].team_id, 'Bo1');
  const semi2 = buildMatch('Semifinal_2', sortedSlots[1].team_id, sortedSlots[2].team_id, 'Bo1');
  const winner1 = getMatchWinnerId(semi1);
  const loser1 = getMatchLoserId(semi1);
  const winner2 = getMatchWinnerId(semi2);
  const loser2 = getMatchLoserId(semi2);

  const final = buildMatch('Final', winner1, winner2, 'Bo1');
  const third = buildMatch('Third_Place', loser1, loser2, 'Bo1');

  const isPlayoff = isPlayoffGroup(group.name);
  const playoffSemi1 = buildMatch('Playoff_Semi_1', sortedSlots[0].team_id, sortedSlots[3].team_id, 'Bo3');
  const playoffSemi2 = buildMatch('Playoff_Semi_2', sortedSlots[1].team_id, sortedSlots[2].team_id, 'Bo3');
  const playoffFinal = buildMatch('Playoff_Final', getMatchWinnerId(playoffSemi1), getMatchWinnerId(playoffSemi2), 'Bo5');

  const matches = isPlayoff
    ? [playoffSemi1, playoffSemi2, playoffFinal]
    : [semi1, semi2, final, third];

  return {
    ...group,
    group_teams: sortedSlots,
    matches: matches.sort((a, b) => (stageOrder[a.stage] || 99) - (stageOrder[b.stage] || 99))
  };
}

function getGroupPlacementPoints(group: DbGroup, teamId: string): number {
  const finalMatch = group.matches.find(m => m.stage === 'Final');
  const thirdMatch = group.matches.find(m => m.stage === 'Third_Place');

  if (finalMatch && finalMatch.status === 'Finished') {
    if (finalMatch.score_a !== null && finalMatch.score_b !== null) {
      if (finalMatch.score_a > finalMatch.score_b && finalMatch.team_a_id === teamId) return 1000;
      if (finalMatch.score_b > finalMatch.score_a && finalMatch.team_b_id === teamId) return 1000;
      if (finalMatch.score_a > finalMatch.score_b && finalMatch.team_b_id === teamId) return 700;
      if (finalMatch.score_b > finalMatch.score_a && finalMatch.team_a_id === teamId) return 700;
    }
  }

  if (thirdMatch && thirdMatch.status === 'Finished') {
    if (thirdMatch.score_a !== null && thirdMatch.score_b !== null) {
      if (thirdMatch.score_a > thirdMatch.score_b && thirdMatch.team_a_id === teamId) return 400;
      if (thirdMatch.score_b > thirdMatch.score_a && thirdMatch.team_b_id === teamId) return 400;
      if (thirdMatch.score_a > thirdMatch.score_b && thirdMatch.team_b_id === teamId) return 200;
      if (thirdMatch.score_b > thirdMatch.score_a && thirdMatch.team_a_id === teamId) return 200;
    }
  }

  return 0;
}

export function calculateGlobalStandings(dates: DbDate[], dbTeams: Team[]): (TeamPoints & { team: Team })[] {
  const standingsMap: Record<string, TeamPoints> = {};

  dbTeams.forEach(t => {
    standingsMap[t.id] = { teamId: t.id, pointsF1: 0, pointsF2: 0, pointsF3: 0, totalPoints: 0, qualified: false };
  });

  dates.forEach(date => {
    if (date.sequence_order > 3) return;
    date.groups.forEach(group => {
      const groupTeamIds = new Set(group.group_teams.map(gt => gt.team_id).filter(Boolean) as string[]);
      group.matches.forEach(m => {
        if (m.team_a_id) groupTeamIds.add(m.team_a_id);
        if (m.team_b_id) groupTeamIds.add(m.team_b_id);
      });

      groupTeamIds.forEach(teamId => {
        if (!standingsMap[teamId]) {
          standingsMap[teamId] = { teamId, pointsF1: 0, pointsF2: 0, pointsF3: 0, totalPoints: 0, qualified: false };
        }
        const pts = getGroupPlacementPoints(group, teamId);
        if (date.sequence_order === 1) standingsMap[teamId].pointsF1 += pts;
        if (date.sequence_order === 2) standingsMap[teamId].pointsF2 += pts;
        if (date.sequence_order === 3) standingsMap[teamId].pointsF3 += pts;
      });
    });
  });

  const sorted = Object.values(standingsMap).map(s => {
    s.totalPoints = s.pointsF1 + s.pointsF2 + s.pointsF3;
    return s;
  }).sort((a, b) => b.totalPoints - a.totalPoints);

  sorted.forEach((s, idx) => {
    s.qualified = idx < 4 && s.totalPoints > 0;
  });

  return sorted.map(s => ({
    ...s,
    team: dbTeams.find(t => t.id === s.teamId) || { id: s.teamId, name: 'TBD', tag: 'TBD' }
  }));
}

export function normalizeDateState(date: DbDate): DbDate {
  return {
    ...date,
    groups: date.groups
      .map(normalizeGroupState)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  };
}
