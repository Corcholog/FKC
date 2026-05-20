const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const RIOT_API_KEY = process.env.RIOT_API_KEY;

async function run() {
  const matchId = 'LA2_1593192842';
  console.log('Fetching match details from Riot API for:', matchId);

  const res = await fetch(`https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`, {
    headers: { 'X-Riot-Token': RIOT_API_KEY }
  });

  if (!res.ok) {
    console.error('Riot API error:', res.status, res.statusText);
    return;
  }

  const matchData = await res.json();
  const riotParticipants = matchData?.info?.participants;
  if (!riotParticipants) {
    console.error('No participants in match data');
    return;
  }

  // Corcho's PUUID
  const playerPuuid = 'cDEcUdvKUsgvkZszC2w1yvzk4ZMX7d9LCKFdBI-XtVOK_ZMTAGsdLdNgLhvl9IpQvXJTStAqudf_ew';

  let targetParticipant = riotParticipants.find((rp) => rp.puuid === playerPuuid);
  console.log('Found participant by PUUID:', targetParticipant ? 'YES' : 'NO');

  if (!targetParticipant) {
    targetParticipant = riotParticipants.find((rp) => 
      rp.championName.toLowerCase() === 'ryze'
    );
    console.log('Found participant by Ryze:', targetParticipant ? 'YES' : 'NO');
  }

  if (!targetParticipant) {
    console.error('Participant not found');
    return;
  }

  console.log('Target Participant Stats:');
  console.log({
    championName: targetParticipant.championName,
    totalDamageDealtToChampions: targetParticipant.totalDamageDealtToChampions,
    goldEarned: targetParticipant.goldEarned,
    visionScore: targetParticipant.visionScore,
    totalDamageTaken: targetParticipant.totalDamageTaken,
  });

  const teammates = riotParticipants.filter((p) => p.teamId === targetParticipant.teamId);
  const team_total_kills = teammates.reduce((sum, p) => sum + (p.kills || 0), 0);
  const team_total_deaths = teammates.reduce((sum, p) => sum + (p.deaths || 0), 0);
  const team_total_damage = teammates.reduce((sum, p) => sum + (p.totalDamageDealtToChampions || 0), 0);
  const team_total_gold = teammates.reduce((sum, p) => sum + (p.goldEarned || 0), 0);

  console.log('Calculated Team Totals:');
  console.log({
    team_total_kills,
    team_total_deaths,
    team_total_damage,
    team_total_gold,
  });

  const rawDuration = matchData?.info?.gameDuration || 1800;
  const isMilliseconds = rawDuration > 50000;
  const gameDurationSeconds = isMilliseconds ? Math.floor(rawDuration / 1000) : rawDuration;
  const duration_minutes = Math.max(1, Math.floor(gameDurationSeconds / 60));
  const duration_seconds = gameDurationSeconds % 60;

  console.log('Updating database...');
  const { data: updateData, error: updateErr, status } = await supabase
    .from('soloq_matches')
    .update({
      duration_minutes,
      duration_seconds,
      damage_dealt: targetParticipant.totalDamageDealtToChampions || 0,
      gold_earned: targetParticipant.goldEarned || 0,
      vision_score: targetParticipant.visionScore || 0,
      damage_taken: targetParticipant.totalDamageTaken || 0,
      team_total_damage,
      team_total_gold,
      team_total_kills,
      team_total_deaths
    })
    .eq('match_id', 'LA2_1593192842') // Note: we are filtering by match_id
    .select();

  console.log('Update result:');
  console.log({ status, updateErr, updateData });
}

run();
