import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const RIOT_API_KEY = process.env.RIOT_API_KEY;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithRetry = async (url: string, retries = 2): Promise<Response> => {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers: { 'X-Riot-Token': RIOT_API_KEY! } });
    if (res.status === 429) {
      console.warn(`Rate limited on ${url}, retrying in 5 seconds...`);
      await delay(5000);
      continue;
    }
    return res;
  }
  return fetch(url, { headers: { 'X-Riot-Token': RIOT_API_KEY! } });
};

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: players, error: playersError } = await supabase.from('tournament_players').select('*');

    if (playersError || !players) {
      throw new Error('Could not fetch tournament players');
    }

    let updatedCount = 0;

    for (const player of players) {
      let puuid = player.puuid;
      let gameName = player.ign;
      let tagLine = 'LAN'; // Default tag

      if (player.ign.includes('#')) {
        const parts = player.ign.split('#');
        gameName = parts[0].trim();
        tagLine = parts[1].trim();
      }

      console.log(`[Tournament Sync] Processing ${player.ign}...`);

      // 1. Fetch PUUID if missing
      if (!puuid) {
        const accRes = await fetchWithRetry(`https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`);
        if (accRes.ok) {
          const accData = await accRes.json();
          puuid = accData.puuid;
          console.log(`[Tournament Sync] Fetched PUUID for ${player.ign}`);
        } else {
          console.error(`[Tournament Sync] Failed to fetch PUUID for ${player.ign}. Status: ${accRes.status}`);
          continue;
        }
      }

      // 2. Fetch Ranked Stats
      const leagueRes = await fetchWithRetry(`https://la2.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`);
      if (leagueRes.ok) {
        const leagues = await leagueRes.json();
        
        const soloq = leagues.find((l: any) => l.queueType === 'RANKED_SOLO_5x5');
        const flexq = leagues.find((l: any) => l.queueType === 'RANKED_FLEX_SR');

        const updateData: any = { puuid };

        if (soloq) {
          updateData.soloq_tier = soloq.tier;
          updateData.soloq_rank = soloq.rank;
          updateData.soloq_lp = soloq.leaguePoints;
        }

        if (flexq) {
          updateData.flexq_tier = flexq.tier;
          updateData.flexq_rank = flexq.rank;
          updateData.flexq_lp = flexq.leaguePoints;
        }

        const { error: updateError } = await supabase.from('tournament_players').update(updateData).eq('id', player.id);

        if (updateError) {
          console.error(`[Tournament Sync] Supabase update error for ${player.ign}:`, updateError);
        } else {
          updatedCount++;
        }
      } else {
        console.error(`[Tournament Sync] Failed to fetch leagues for ${player.ign}. Status: ${leagueRes.status}`);
      }
    }

    return NextResponse.json({ success: true, updatedCount });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
