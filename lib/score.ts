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
  teamPosition: string;
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
}

interface MatchObjectives {
  dragons: number;
  barons: number;
  hersalds: number;
}

const clamp = (val: number, min: number, max: number) =>
  Math.max(min, Math.min(max, val));

const safeDiv = (num: number, den: number) =>
  den > 0 ? num / den : 0;

const avg = (arr: number[]) =>
  arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

const tanh = (x: number) => {
  return (Math.exp(x) - Math.exp(-x)) / (Math.exp(x) + Math.exp(-x));
};

export const calculateScoreV3 = (
  player: PlayerData,
  opponent: OpponentData | null,
  teamTotals: TeamTotals,
  matchDuration: number,
  role: string,
  objectives: MatchObjectives,
  teamParticipants: PlayerData[]
): number => {
  const duration = Math.max(1, matchDuration);

  const avgDpm = avg(teamParticipants.map(p => p.damageDealt / duration));
  const avgCspm = avg(teamParticipants.map(p => p.cs / duration));
  const avgGpm = avg(teamParticipants.map(p => p.goldEarned / duration));
  const avgVpm = avg(teamParticipants.map(p => p.visionScore / duration));

  const global = calculateGlobal(player, duration, role, avgDpm, avgCspm, avgGpm, avgVpm);
  const vsOpp = calculateVsOpponent(player, opponent);
  const team = calculateTeamImpact(player, teamTotals, role);
  const roleScore = calculateRole(player, role, duration);
  const obj = calculateObjectives(player, objectives);

  const raw =
    global * 0.35 +
    vsOpp * 0.25 +
    team * 0.18 +
    roleScore * 0.12 +
    obj * 0.10;

  return Math.round(clamp(raw, 0, 100));
};

const calculateGlobal = (
  p: PlayerData,
  duration: number,
  role: string,
  avgDpm: number,
  avgCspm: number,
  avgGpm: number,
  avgVpm: number
) => {
  const dpm = p.damageDealt / duration;
  const cspm = p.cs / duration;
  const gpm = p.goldEarned / duration;
  const vpm = p.visionScore / duration;

  const dmgScore = clamp((dpm / (avgDpm || 1)) * 10, 0, 20);
  const csScore = clamp((cspm / (avgCspm || 1)) * 10, 0, 15);
  const goldScore = clamp((gpm / (avgGpm || 1)) * 10, 0, 20);

  const visionWeight = role === 'Support' ? 1.8 : 0.7;
  const visionScore = clamp((vpm / (avgVpm || 1)) * 10 * visionWeight, 0, 15);

  const kda =
    (p.kills + p.assists * (role === 'Support' ? 1.5 : 1)) /
    Math.max(1, p.deaths);

  const kdaScore = clamp(kda * 3, 0, 20);

  return dmgScore + csScore + goldScore + visionScore + kdaScore;
};

const calculateVsOpponent = (p: PlayerData, opp: OpponentData | null) => {
  if (!opp) return 0;

  const xpDiff = p.champExperience - opp.champExperience;
  const goldDiff = p.goldEarned - opp.goldEarned;
  const csDiff = p.cs - opp.cs;

  const xpScore = 15 * tanh(xpDiff / 3000);
  const goldScore = 15 * tanh(goldDiff / 4000);
  const csScore = 10 * tanh(csDiff / 100);

  return xpScore + goldScore + csScore;
};

const calculateTeamImpact = (
  p: PlayerData,
  totals: TeamTotals,
  role: string
) => {
  const kp = safeDiv(p.kills + p.assists, totals.teamKills) * 100;
  const dmgShare = safeDiv(p.damageDealt, totals.teamDamageDealt) * 100;
  const takenShare = safeDiv(p.damageTaken, totals.teamDamageTaken) * 100;

  const kpScore = kp * 0.5;

  const dmgScore =
    role === 'ADC' || role === 'Mid'
      ? dmgShare * 0.8
      : dmgShare * 0.4;

  const tankScore =
    role === 'Top' || role === 'Jungle'
      ? takenShare * 0.4
      : takenShare * 0.2;

  return clamp(kpScore + dmgScore + tankScore, 0, 30);
};

const calculateRole = (
  p: PlayerData,
  role: string,
  duration: number
) => {
  if (role === 'Support') {
    return (
      p.wardsPlaced * 0.6 +
      p.wardsCleared * 1.2 +
      p.detectorWardsPlaced * 2
    );
  }

  if (role === 'Jungle') {
    return (
      (p.neutralMinionsKilled / duration) * 10 +
      p.damageDealtToObjectives / 800
    );
  }

  if (role === 'Mid' || role === 'ADC') {
    return (
      (p.damageDealt / duration) * 0.05 +
      p.turretKills * 3
    );
  }

  return (
    (p.cs / duration) * 2 +
    p.turretKills * 3 +
    p.damageTaken * 0.0005
  );
};

const calculateObjectives = (
  p: PlayerData,
  obj: MatchObjectives
) => {
  return (
    p.damageDealtToObjectives / 1000 +
    obj.dragons * 2 +
    obj.barons * 3 +
    obj.hersalds * 2
  );
};