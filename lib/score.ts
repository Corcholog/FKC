export const calculateScore = (
  goldEarned: number,
  visionScore: number,
  teamKills: number,
  myKills: number,
  myAssists: number,
  myDeaths: number,
  myDamageDealt: number,
  myDamageTaken: number,
  myCCTime: number,
  teamDamageDealt: number,
  teamDamageTaken: number,
  teamCCTime: number,
  durationMinutes: number
): number => {
  if (durationMinutes <= 0 || teamKills <= 0 || teamDamageDealt <= 0) return 0;

  const goldScore = (goldEarned / durationMinutes) / 130;
  const visionScoreCalc = (visionScore / durationMinutes) * 1.6;
  const participationScore = ((myKills + myAssists) / teamKills) * 2;
  const smartKDA = (myKills - myDeaths + myAssists / 1.5) / 3.5;

  const damageTakenPct = teamDamageTaken > 0 ? (myDamageTaken / teamDamageTaken) * 100 : 0;
  const teamUtility = damageTakenPct + (myCCTime / 50) - 0.6;

  const teamDamagePct = teamDamageDealt > 0 ? (myDamageDealt / teamDamageDealt) * 100 : 0;
  const damageImpact = teamDamagePct + (myDamageDealt / durationMinutes) / 800;

  const rawScore = goldScore + visionScoreCalc + participationScore + smartKDA + teamUtility + damageImpact;
  const finalScore = Math.min(10, Math.max(0, rawScore / 1.70));

  return Number(finalScore.toFixed(2));
};