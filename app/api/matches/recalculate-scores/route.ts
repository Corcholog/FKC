import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateScore } from '@/lib/score';

const RIOT_API_KEY = process.env.RIOT_API_KEY;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    let body = {};
    try { body = await request.json(); } catch(e) {}
    const { force = true } = body as { force?: boolean };
    console.log('FORCE:', force);

    const { data: matches, error } = await supabase
      .from('matches')
      .select('id, match_id, duration_minutes, ally_participants(id, champion, role, kills, deaths, assists, score)');

    if (error) throw error;

    let updatedRows = 0;
    const skipped: { id: number; reason: string }[] = [];
    const logs: string[] = [];

    if (matches.length === 0) {
      return NextResponse.json({ success: true, message: 'No matches found' });
    }
    
    const matchesWithScores = matches.filter(m => m.ally_participants.some(p => p.score > 0));
    const matchesWithoutScores = matches.filter(m => !m.ally_participants.some(p => p.score > 0));
    console.log('Matches with scores:', matchesWithScores.length);
    console.log('Matches without scores:', matchesWithoutScores.length);
    if (matchesWithoutScores.length > 0) {
      console.log('Sample matches without scores:', matchesWithoutScores.slice(0, 3).map(m => ({ id: m.id, match_id: m.match_id })));
    }

    for (const match of matches) {
      if (!match.match_id) {
        skipped.push({ id: match.id, reason: 'Missing match_id' });
        continue;
      }

      if (!force && match.ally_participants.length > 0 && match.ally_participants.every((p: any) => p.score !== null && p.score > 0)) {
        skipped.push({ id: match.id, reason: 'Already calculated' });
        continue;
      }

      console.log('Processing match:', match.match_id);
      const fullMatchId = match.match_id.includes('_') ? match.match_id : `LA2_${match.match_id}`;

      await delay(200);
      const matchDataRes = await fetch(
        `https://americas.api.riotgames.com/lol/match/v5/matches/${fullMatchId}`,
        { headers: { 'X-Riot-Token': RIOT_API_KEY! } }
      );
      console.log('Response:', matchDataRes.status);

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

      const durationMinutes = Math.max(1, Math.floor((matchData?.info?.gameDuration || 1800) / 60));

      const ourTeamId = riotParticipants.find((p: any) =>
        match.ally_participants.some((ap: any) =>
          ap.champion.toLowerCase() === p.championName.toLowerCase()
        )
      )?.teamId || 100;

      const ourParticipants = riotParticipants.filter((p: any) => p.teamId === ourTeamId);

      const teamKills = ourParticipants.reduce((s: number, p: any) => s + (p.kills || 0), 0);
      const teamDamageDealt = ourParticipants.reduce((s: number, p: any) => s + (p.totalDamageDealtToChampions || 0), 0);
      const teamDamageTaken = ourParticipants.reduce((s: number, p: any) => s + (p.totalDamageTaken || 0), 0);
      const teamCCTime = ourParticipants.reduce((s: number, p: any) => s + (p.timeCCingOthers || 0), 0);

      for (const p of match.ally_participants) {
        const normalize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const riotData = ourParticipants.find((rp: any) =>
          normalize(rp.championName) === normalize(p.champion)
        );

        if (!riotData) {
          logs.push(`No Riot data for ${p.champion} in match ${match.id}`);
          continue;
        }

        const score = calculateScore(
          riotData.goldEarned || 0,
          riotData.visionScore || 0,
          teamKills,
          p.kills,
          p.assists,
          p.deaths,
          riotData.totalDamageDealtToChampions || 0,
          riotData.totalDamageTaken || 0,
          riotData.timeCCingOthers || 0,
          teamDamageDealt,
          teamDamageTaken,
          teamCCTime,
          durationMinutes
        );

        const { error: updateErr } = await supabase
          .from('ally_participants')
          .update({ score })
          .eq('id', p.id);

        if (updateErr) {
          logs.push(`Failed update ${p.champion}: ${updateErr.message}`);
        } else {
          updatedRows++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updatedRows} scores. Skipped: ${skipped.length}`,
      updated: updatedRows,
      skipped_info: skipped.slice(0, 10),
      logs: logs.slice(0, 10)
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}