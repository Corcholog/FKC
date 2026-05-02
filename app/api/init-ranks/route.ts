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
    const { data: players, error: playersError } = await supabase.from('players').select('*');

    if (playersError || !players) {
      throw new Error('Could not fetch players');
    }

    let updatedCount = 0;

    for (const player of players) {
      let puuid = player.puuid;

      console.log(`[Init Ranks] Processing ${player.name} (IGN: ${player.ign})...`);

      if (player.name === 'Corcho') {
        const accRes = await fetchWithRetry(`https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent('Corcho')}/FKC`);
        if (accRes.ok) {
          const accData = await accRes.json();
          puuid = accData.puuid;
          console.log(`[Init Ranks] Hardcoded Corcho PUUID fetched: ${puuid}`);
        } else {
          console.error(`[Init Ranks] Failed to fetch Corcho override PUUID. Status: ${accRes.status}`);
        }
      }

      if (!puuid) {
        console.log(`[Init Ranks] Missing PUUID for ${player.name}, skipping.`);
        continue;
      }

      // 1. Fetch Ranked Stats using PUUID
      const leagueRes = await fetchWithRetry(`https://la2.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`);
      if (leagueRes.ok) {
        const leagues = await leagueRes.json();
        const soloq = leagues.find((l: any) => l.queueType === 'RANKED_SOLO_5x5');
        if (soloq) {
          console.log(`[Init Ranks] Found SoloQ stats for ${player.name}: ${soloq.tier} ${soloq.rank} ${soloq.leaguePoints}LP`);
          const { error: updateError } = await supabase.from('players').update({
            soloq_tier: soloq.tier,
            soloq_rank: soloq.rank,
            soloq_lp: soloq.leaguePoints
          }).eq('id', player.id);

          if (updateError) {
            console.error(`[Init Ranks] Supabase update error for ${player.name}:`, updateError);
          } else {
            updatedCount++;
          }
        } else {
          console.log(`[Init Ranks] Player ${player.name} is Unranked in SoloQ.`);
        }
      } else {
        console.error(`[Init Ranks] Failed to fetch leagues for ${player.name}. Status: ${leagueRes.status}`);
      }
    }

    return NextResponse.json({ success: true, updatedCount });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
