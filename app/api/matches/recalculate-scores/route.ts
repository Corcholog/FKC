import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const RIOT_API_KEY = process.env.RIOT_API_KEY;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    let body = {};
    try { body = await request.json(); } catch(e) {}
    const { force = false } = body as { force?: boolean };

    const { data: matches, error } = await supabase
      .from('matches')
      .select('id, match_id, we_won, ally_participants(id, champion, role, kills, deaths, assists, vision_score)');

    if (error) throw error;

    let updatedRows = 0;
    const skipped = [];
    const logs = [];

    for (const match of matches) {
      if (!match.match_id) {
        skipped.push({ id: match.id, reason: 'Missing match_id' });
        continue;
      }

      // If force is not passed, only update matches where ally_participants have 0 vision_score (assume never fetched)
      const needsUpdate = force || match.ally_participants.some((p: any) => !p.vision_score || p.vision_score === 0);
      
      if (!needsUpdate) {
        skipped.push({ id: match.id, reason: 'Already calculated' });
        continue;
      }

      const fullMatchId = match.match_id.includes('_') ? match.match_id : `LA2_${match.match_id}`;

      // Ping Riot API
      await delay(200); // Respect rate limit
      const matchDataRes = await fetch(
        `https://americas.api.riotgames.com/lol/match/v5/matches/${fullMatchId}`,
        { headers: { 'X-Riot-Token': RIOT_API_KEY! } }
      );

      if (!matchDataRes.ok) {
        logs.push(`Failed to fetch ${fullMatchId} from Riot API. Status: ${matchDataRes.status}`);
        
        // Compute with Fallback logic missing Riot data
        for (const p of match.ally_participants) {
            let score = (p.kills * 3) + (p.assists * 2) - (p.deaths * 2);
            await supabase.from('ally_participants').update({ score: Number(score.toFixed(2)) }).eq('id', p.id);
            updatedRows++;
        }
        continue;
      }

      const matchData = await matchDataRes.json();
      const riotParticipants = matchData?.info?.participants;

      if (!riotParticipants) {
        logs.push(`No participants found in Riot API for ${fullMatchId}`);
        continue;
      }

      // Update each ally
      for (const p of match.ally_participants) {
        let score = (p.kills * 3) + (p.assists * 2) - (p.deaths * 2);
        
        const normalize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        
        // Find matching riot participant by Champion Name
        const riotData = riotParticipants.find((rp: any) => normalize(rp.championName) === normalize(p.champion));
        
        let vision_score = 0;
        let damage_dealt = 0;
        let gold_earned = 0;

        if (riotData) {
          vision_score = riotData.visionScore || 0;
          damage_dealt = riotData.totalDamageDealtToChampions || 0;
          gold_earned = riotData.goldEarned || 0;

          score += (damage_dealt / 1000) + (gold_earned / 1000);
          if (p.role === 'Support') {
            score += vision_score * 0.5;
          }
        }

        const scoreRounded = Number(score.toFixed(2));

        const { error: updateErr } = await supabase
          .from('ally_participants')
          .update({
             vision_score,
             damage_dealt,
             gold_earned,
             score: scoreRounded
          })
          .eq('id', p.id);
          
        if (updateErr) {
            logs.push(`Failed to update Player ${p.champion} in Match ${match.id}: ${updateErr.message}`);
        } else {
            updatedRows++;
        }
      }
    }

    console.log("RECALCULATION LOGS:", logs, "SKIPPED:", skipped.length, "UPDATED:", updatedRows);
    
    return NextResponse.json({ 
        success: true, 
        message: `Updated ${updatedRows} player records across matches.`,
        skipped: skipped.length,
        logs 
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
