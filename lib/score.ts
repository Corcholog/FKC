interface PlayerData {
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  goldEarned: number;
  visionScore: number;
  damageDealt: number;
  damageTaken: number;
  champExperience: number;
  neutralMinionsKilled: number;
  damageDealtToObjectives: number;
  turretKills: number;
  detectorWardsPlaced: number;
  wardsPlaced: number;
  wardsCleared: number;
  teamPosition: string;
}

interface OpponentData {
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  goldEarned: number;
  visionScore: number;
  champExperience: number;
  neutralMinionsKilled: number;
}

interface TeamTotals {
  teamKills: number;
  teamDamageDealt: number;
  teamDamageTaken: number;
  teamAssists: number;
}

interface MatchObjectives {
  dragons: number;
  barons: number;
  hersalds: number;
}

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
const safeDiv = (num: number, den: number) => den > 0 ? num / den : 0;

export const calculateScoreV2 = (
  player: PlayerData,
  opponent: OpponentData | null,
  teamTotals: TeamTotals,
  matchDuration: number,
  role: string,
  objectives: MatchObjectives
): number => {
  const duration = matchDuration > 0 ? matchDuration : 1;

  const globalScore = calculateGlobalScore(player, duration, role);
  const opponentScore = calculateVsOpponentScore(player, opponent, duration);
  const teamScore = calculateTeamImpactScore(player, teamTotals, duration);
  const roleScore = calculateRoleScore(player, role, duration);
  const objectiveScore = calculateObjectiveScore(player, objectives);

  const rawScore = globalScore * 0.40 + opponentScore * 0.22 + teamScore * 0.16 + roleScore * 0.14 + objectiveScore * 0.08;
  
  return Math.round(clamp(rawScore, 0, 100));
};

const calculateGlobalScore = (p: PlayerData, duration: number, role: string): number => {
  const gpm = p.goldEarned / duration;
  const cspm = p.cs / duration;
  const dpm = p.damageDealt / duration;
  const vpm = p.visionScore / duration;

  const assistWeight = role === 'Support' ? 3.5 : 2.5;
  const visionWeight = role === 'Support' ? 2.0 : 0.8;

  const killScore = Math.min(20, p.kills * 4);
  const deathScore = p.deaths * -3;
  const assistScore = Math.min(15, p.assists * assistWeight);
  const csScore = Math.min(15, cspm * 0.8);
  const goldScore = Math.min(25, gpm / 80);
  const damageScore = Math.min(20, dpm / 150);
  const visionScore = Math.min(10, vpm * visionWeight);

  return killScore + deathScore + assistScore + csScore + goldScore + damageScore + visionScore;
};

const calculateVsOpponentScore = (p: PlayerData, opp: OpponentData | null, duration: number): number => {
  if (!opp) return 50;

  const pCspm = p.cs / duration;
  const oppCspm = opp.cs / duration;

  const xpDiff = p.champExperience - opp.champExperience;
  const goldDiff = p.goldEarned - opp.goldEarned;
  const csDiff = p.cs - opp.cs;
  const visionDiff = p.visionScore - opp.visionScore;

  const xpScore = clamp(xpDiff / 400, -15, 15);
  const goldScore = clamp(goldDiff / 150, -15, 15);
  const csScore = clamp((pCspm - oppCspm) * 2, -10, 10);
  const visionScore = clamp(visionDiff * 0.5, -5, 5);

  return xpScore + goldScore + csScore + visionScore + 50;
};

const calculateTeamImpactScore = (p: PlayerData, totals: TeamTotals, duration: number): number => {
  const kp = totals.teamKills > 0 
    ? ((p.kills + p.assists) / totals.teamKills) * 100 
    : 50;
  
  const dmgShare = totals.teamDamageDealt > 0 
    ? (p.damageDealt / totals.teamDamageDealt) * 100 
    : 20;
  
  const takenShare = totals.teamDamageTaken > 0 
    ? (p.damageTaken / totals.teamDamageTaken) * 100 
    : 20;

  const kpScore = Math.min(25, kp * 0.35);
  const dmgScore = Math.min(25, dmgShare * 0.6);
  const takenScore = Math.min(15, clamp(takenShare * 0.4, -10, 15));

  return kpScore + dmgScore + takenScore;
};

const calculateRoleScore = (p: PlayerData, role: string, duration: number): number => {
  if (role === 'Support') {
    const wardsPlaced = Math.min(20, p.wardsPlaced / (duration / 6) * 1.5);
    const wardsCleared = Math.min(15, p.wardsCleared * 2);
    const controlWards = Math.min(15, p.detectorWardsPlaced * 3);
    const assistBonus = Math.min(20, p.assists * 1.5);
    return wardsPlaced + wardsCleared + controlWards + assistBonus;
  }

  if (role === 'Jungle') {
    const jgCs = Math.min(20, p.neutralMinionsKilled / duration * 15);
    const objDmg = Math.min(20, p.damageDealtToObjectives / 500);
    const killPart = Math.min(15, p.kills + p.assists);
    return jgCs + objDmg + killPart;
  }

  if (role === 'Mid') {
    const soloKills = Math.min(25, p.kills * 4);
    const turret = Math.min(20, p.turretKills * 8);
    const cs10 = Math.min(15, p.cs > 80 ? 15 : p.cs / 80 * 15);
    return soloKills + turret + cs10;
  }

  if (role === 'ADC') {
    const dmg = Math.min(30, p.damageDealt / 100);
    const cs = Math.min(20, p.cs / 8);
    const turret = Math.min(15, p.turretKills * 5);
    return dmg + cs + turret;
  }

  const csScore = Math.min(25, p.cs / 8);
  const dmgScore = Math.min(25, p.damageDealt / 200);
  const turretScore = Math.min(15, p.turretKills * 5);
  return csScore + dmgScore + turretScore;
};

const calculateObjectiveScore = (p: PlayerData, objectives: MatchObjectives): number => {
  const dragDmg = objectives.dragons * 20;
  const baronDmg = objectives.barons * 25;
  const heraldDmg = objectives.hersalds * 15;
  const objDmg = Math.min(30, p.damageDealtToObjectives / 300);

  return dragDmg + baronDmg + heraldDmg + objDmg;
};

export const recalculateScoresForTeam = (
  participants: PlayerData[],
  enemyParticipants: OpponentData[],
  teamTotals: TeamTotals,
  matchDuration: number,
  objectives: MatchObjectives
): { scores: number[] } => {
  const scores = participants.map(p => {
    const role = p.teamPosition === 'UTILITY' ? 'Support' 
      : p.teamPosition === 'JUNGLE' ? 'Jungle'
      : p.teamPosition === 'MIDDLE' ? 'Mid'
      : p.teamPosition === 'BOTTOM' ? 'ADC'
      : 'Top';

    const opponent = enemyParticipants.find(e => e.teamPosition === p.teamPosition) || null;

    return calculateScoreV2(p, opponent, teamTotals, matchDuration, role, objectives);
  });

  return { scores };
};