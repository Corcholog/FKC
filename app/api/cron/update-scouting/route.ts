import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { RiotLeagueEntryDTO } from '@/lib/riot-types';

const RIOT_API_KEY = process.env.RIOT_API_KEY;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithRetry = async (url: string, retries = 1): Promise<Response> => {
  const res = await fetch(url, { headers: { 'X-Riot-Token': RIOT_API_KEY! } });
  if (res.status === 429) {
    throw new Error("Rate limit exceeded permanently");
  }
  return res;
};

export async function GET(request: Request) {
  // 1. Verify Vercel Cron Secret (Security)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createClient();
    
    // Fetch all players from all tournament teams
    const { data: players, error } = await supabase.from('tournament_players').select('*');
    if (error || !players) throw new Error('Failed to fetch tournament players');

    let updatedCount = 0;

    for (const player of players) {
      let puuid = player.puuid;

      // If PUUID is missing, try to fetch it via Riot ID
      if (!puuid && player.ign) {
        try {
          const parts = player.ign.split('#');
          const gameName = parts[0]?.trim();
          const tagLine = parts[1]?.trim() || "LAN";
          
          if (gameName) {
            const accRes = await fetchWithRetry(
              `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
            );
            if (accRes.ok) {
              const accData = await accRes.json();
              puuid = accData.puuid;
              // Save it back to db so we don't have to fetch next time
              await supabase.from('tournament_players').update({ puuid }).eq('id', player.id);
            }
          }
        } catch (e) {
          console.error(`Failed to fetch PUUID for ${player.ign}`);
        }
      }

      if (!puuid) continue;

      // 2. Fetch Ranked Stats using PUUID
      try {
        await delay(100); // Respect rate limits
        const leagueRes = await fetchWithRetry(`https://la2.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`);
        
        if (leagueRes.ok) {
          const leagues = await leagueRes.json();
          const soloq = leagues.find((l: RiotLeagueEntryDTO) => l.queueType === 'RANKED_SOLO_5x5');
          const flexq = leagues.find((l: RiotLeagueEntryDTO) => l.queueType === 'RANKED_FLEX_SR');

          // We shift current stats to prev_ stats, and update with new stats.
          const updates: any = {
            prev_soloq_tier: player.soloq_tier,
            prev_soloq_rank: player.soloq_rank,
            prev_soloq_lp: player.soloq_lp,
            prev_flexq_tier: player.flexq_tier,
            prev_flexq_rank: player.flexq_rank,
            prev_flexq_lp: player.flexq_lp,
          };

          if (soloq) {
            updates.soloq_tier = soloq.tier;
            updates.soloq_rank = soloq.rank;
            updates.soloq_lp = soloq.leaguePoints;
          } else {
            updates.soloq_tier = null;
            updates.soloq_rank = null;
            updates.soloq_lp = null;
          }

          if (flexq) {
            updates.flexq_tier = flexq.tier;
            updates.flexq_rank = flexq.rank;
            updates.flexq_lp = flexq.leaguePoints;
          } else {
            updates.flexq_tier = null;
            updates.flexq_rank = null;
            updates.flexq_lp = null;
          }

          await supabase.from('tournament_players').update(updates).eq('id', player.id);
          updatedCount++;
        }
      } catch (e) {
        console.error(`Failed to update stats for player ${player.ign}`, e);
      }
    }

    return NextResponse.json({ success: true, updatedCount });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
