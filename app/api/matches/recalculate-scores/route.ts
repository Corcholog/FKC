import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateScoreV3 } from '@/lib/score';

const RIOT_API_KEY = process.env.RIOT_API_KEY;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type PlayerScore = {
  id: number;
  score: number;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    let body = {};
    try { body = await request.json(); } catch (e) {}

    const { force = true } = body as { force?: boolean };

    const { data: matches, error } = await supabase
      .from('matches')
      .select('id, match_id, duration_minutes, ally_participants(id, champion, role, kills, deaths, assists, score)');

    if (error) throw error;

    if (!matches || matches.length === 0) {
      return NextResponse.json({ success: true, message: 'No matches found' });
    }

    let updatedRows = 0;
    const skipped: { id: number; reason: string }[] = [];
    const logs: string[] = [];

    for (const match of matches) {
      if (!match.match_id) {
        skipped.push({ id: match.id, reason: 'Missing match_id' });
        continue;
      }

      if (
        !force &&
        match.ally_participants.length > 0 &&
        match.ally_participants.every((p: any) => p.score !== null && p.score > 0)
      ) {
        skipped.push({ id: match.id, reason: 'Already calculated' });
        continue;
      }

      const fullMatchId = match.match_id.includes('_')
        ? match.match_id
        : `LA2_${match.match_id}`;

      await delay(200);

      const matchDataRes = await fetch(
        `https://americas.api.riotgames.com/lol/match/v5/matches/${fullMatchId}`,
        { headers: { 'X-Riot-Token': RIOT_API_KEY! } }
      );

      if (!matchDataRes.ok) {
        logs.push(`Failed to fetch ${fullMatchId}: ${matchDataRes.status}`);
        continue;
      }

      const matchData = await matchDataRes.json();
      const riotParticipants = matchData?.info?.participants;

      if (!riotParticipants) {
        logs.push(`No participants for ${fullMatchId}`);
        continue;
      }

      const durationMinutes = Math.max(
        1,
        Math.floor((matchData?.info?.gameDuration || 1800) / 60)
      );

      const ourTeamId =
        riotParticipants.find((p: any) =>
          match.ally_participants.some((ap: any) =>
            ap.champion.toLowerCase() === p.championName.toLowerCase()
          )
        )?.teamId || 100;

      const ourParticipants = riotParticipants.filter((p: any) => p.teamId === ourTeamId);
      const enemyParticipants = riotParticipants.filter((p: any) => p.teamId !== ourTeamId);

      const teamTotals = {
        teamKills: ourParticipants.reduce((s: number, p: any) => s + (p.kills || 0), 0),
        teamDamageDealt: ourParticipants.reduce((s: number, p: any) => s + (p.totalDamageDealtToChampions || 0), 0),
        teamDamageTaken: ourParticipants.reduce((s: number, p: any) => s + (p.totalDamageTaken || 0), 0),
      };

      const objectives = {
        dragons: ourParticipants.reduce((s: number, p: any) => s + (p.dragons || 0), 0),
        barons: ourParticipants.reduce((s: number, p: any) => s + (p.barons || 0), 0),
        hersalds: ourParticipants.reduce((s: number, p: any) => s + (p.riftHeraldTakedowns || 0), 0),
      };

      const teamParticipantsForV3 = ourParticipants.map((p: any) => ({
        kills: p.kills || 0,
        deaths: p.deaths || 0,
        assists: p.assists || 0,
        cs: (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0),
        goldEarned: p.goldEarned || 0,
        visionScore: p.visionScore || 0,
        damageDealt: p.totalDamageDealtToChampions || 0,
        damageTaken: p.totalDamageTaken || 0,
        champExperience: p.champExperience || 0,
        neutralMinionsKilled: p.neutralMinionsKilled || 0,
        damageDealtToObjectives: p.damageDealtToBuildings || 0,
        turretKills: p.turretTakedowns || 0,
        detectorWardsPlaced: p.detectorWardsPlaced || 0,
        wardsPlaced: p.wardsPlaced || 0,
        wardsCleared: p.wardsCleared || 0,
        teamPosition: p.teamPosition || 'TOP',
      }));

      // =========================
      // 1. CALCULAR SCORES
      // =========================
      const computedScores: PlayerScore[] = [];

      for (const p of match.ally_participants) {
        const normalize = (s: string) =>
          s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

        const riotData = ourParticipants.find((rp: any) =>
          normalize(rp.championName) === normalize(p.champion)
        );

        if (!riotData) {
          logs.push(`No Riot data for ${p.champion} in match ${match.id}`);
          continue;
        }

        const opponent =
          enemyParticipants.find((e: any) => e.teamPosition === riotData.teamPosition) || null;

        const role =
          p.role?.toLowerCase() === 'support' ? 'support' :
          p.role?.toLowerCase() === 'jungle' ? 'jungle' :
          p.role?.toLowerCase() === 'mid' ? 'mid' :
          p.role?.toLowerCase() === 'adc' ? 'adc' : 'top';

        const playerData = {
          kills: riotData.kills || 0,
          deaths: riotData.deaths || 0,
          assists: riotData.assists || 0,
          cs: (riotData.totalMinionsKilled || 0) + (riotData.neutralMinionsKilled || 0),
          goldEarned: riotData.goldEarned || 0,
          visionScore: riotData.visionScore || 0,
          damageDealt: riotData.totalDamageDealtToChampions || 0,
          damageTaken: riotData.totalDamageTaken || 0,
          champExperience: riotData.champExperience || 0,
          neutralMinionsKilled: riotData.neutralMinionsKilled || 0,
          damageDealtToObjectives: riotData.damageDealtToBuildings || 0,
          turretKills: riotData.turretTakedowns || 0,
          detectorWardsPlaced: riotData.detectorWardsPlaced || 0,
          wardsPlaced: riotData.wardsPlaced || 0,
          wardsCleared: riotData.wardsCleared || 0,
          teamPosition: riotData.teamPosition || 'TOP',
        };

        const opponentData = opponent ? {
          teamPosition: opponent.teamPosition || 'TOP',
          kills: opponent.kills || 0,
          deaths: opponent.deaths || 0,
          assists: opponent.assists || 0,
          cs: (opponent.totalMinionsKilled || 0) + (opponent.neutralMinionsKilled || 0),
          goldEarned: opponent.goldEarned || 0,
          visionScore: opponent.visionScore || 0,
          champExperience: opponent.champExperience || 0,
          neutralMinionsKilled: opponent.neutralMinionsKilled || 0,
        } : null;

        const rawScore = calculateScoreV3(
          playerData,
          opponentData,
          teamTotals,
          durationMinutes,
          role,
          objectives,
          teamParticipantsForV3
        );

        computedScores.push({
          id: p.id,
          score: isFinite(rawScore) ? rawScore : 0
        });
      }

      // =========================
      // 2. NORMALIZAR
      // =========================
      const maxScore = Math.max(...computedScores.map(p => p.score), 1);

      const normalizedScores = computedScores.map(p => ({
        id: p.id,
        score: Math.round((p.score / maxScore) * 100)
      }));

      // =========================
      // 3. GUARDAR
      // =========================
      for (const p of normalizedScores) {
        const { error: updateErr } = await supabase
          .from('ally_participants')
          .update({ score: p.score })
          .eq('id', p.id);

        if (updateErr) {
          logs.push(`Failed update ${p.id}: ${updateErr.message}`);
        } else {
          updatedRows++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updatedRows} scores. Skipped: ${skipped.length}`,
      updated: updatedRows,
      logs: logs.slice(0, 10)
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}