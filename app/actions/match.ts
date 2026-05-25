'use server'

import { createClient } from '@/lib/supabase/server'

export async function insertMatchToDb(matchData: any, isManual: boolean = false, players: any[] = []) {
  const supabase = await createClient()

  const { data: match, error: matchError } = await supabase
    .from('matches')
    .insert({
      date: new Date(matchData.date).toISOString(),
      match_type: matchData.match_type,
      our_side: matchData.our_side || 'Blue',
      we_won: matchData.we_won,
      duration_minutes: matchData.duration_minutes,
      duration_seconds: matchData.duration_seconds,
      enemy_team_name: matchData.enemy_team_name || null,
      notes: matchData.notes || null,
      match_id: matchData.matchId ? matchData.matchId.split('_').pop() : null,
      org_id: 'FKC' // Hardcoded for now as part of multi-team prep
    })
    .select('id')
    .single()

  if (matchError) throw matchError
  const matchId = match.id

  const allyParticipantsData = matchData.our_participants.map((p: any) => {
    let dbPlayerId = p.player_id;
    if (!isManual) {
      const dbPlayer = players.find(player => {
        if (player.puuid === p.puuid) return true;
        if (player.name === 'Corcho') {
          const corchoPuuids = [
            'CWiI5tqz4IeXj2iLmqRH96WPKHiuGIp8xrFAt2DklNvZtHiDNAYeTOaJmDrw0bIh8jxUPvIzCv-6JA', // volvé camila#MISSU
            'WW7cKwyL1JE36CuyLo3ErQ5k3gijfvxch6Q79RCauyiGSI9Be-n_qj2IX7JcQ5QTKqfEZzfYznRRlA', // Corshus#2108
            'cDEcUdvKUsgvkZszC2w1yvzk4ZMX7d9LCKFdBI-XtVOK_ZMTAGsdLdNgLhvl9IpQvXJTStAqudf_ew', // Corcho#fkc
            'jVrn-jVYqpiVRaBZWK1Q6hQ6r8fH8shXfXtT9MTUVj36hRoDewaay71ZJGzr1I0eQYemnEQTyk8ZeA'  // Nikaro#PAINT
          ];
          return corchoPuuids.includes(p.puuid);
        }
        return false;
      });
      dbPlayerId = dbPlayer?.id || 0;
    }

    return {
      match_id: matchId,
      player_id: dbPlayerId,
      champion: p.champion?.trim() || 'Unknown',
      role: p.role,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      cs: p.cs,
      score: p.score || 0,
      damage_dealt: p.damage_dealt || 0,
      gold_earned: p.gold_earned || 0,
      vision_score: p.vision_score || 0,
      damage_taken: p.damage_taken || 0,
      team_total_damage: p.team_total_damage || 0,
      team_total_gold: p.team_total_gold || 0,
      team_total_kills: p.team_total_kills || 0,
      team_total_deaths: p.team_total_deaths || 0
    }
  })
  
  await supabase.from('ally_participants').insert(allyParticipantsData)

  const enemyParticipantsData = matchData.enemy_participants.map((p: any) => ({
    match_id: matchId,
    champion: p.champion?.trim() || 'Unknown',
    role: p.role,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    cs: p.cs,
  }))
  
  await supabase.from('enemy_participants').insert(enemyParticipantsData)

  await supabase.from('match_bans').insert({
    match_id: matchId,
    our_bans: matchData.our_bans.filter((b: string) => b.trim() !== '' && b !== 'None' && b !== 'Unknown'),
    enemy_bans: matchData.enemy_bans.filter((b: string) => b.trim() !== '' && b !== 'None' && b !== 'Unknown'),
  })
}
