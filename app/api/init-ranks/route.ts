import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getElo } from '@/lib/elo';

const RIOT_API_KEY = process.env.RIOT_API_KEY;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithRetry = async (url: string, retries = 3): Promise<Response> => {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers: { 'X-Riot-Token': RIOT_API_KEY! } });
    if (res.status === 403) {
      throw new Error("Riot API Key is invalid or expired. Please renew it at developer.riotgames.com");
    }
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
      console.warn(`[Riot API] Rate limited on ${url}. Retrying in ${waitTime / 1000}s... (Attempt ${i + 1}/${retries})`);
      await delay(waitTime);
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
      const isCorcho = player.name === 'Corcho';
      let puuidCorcho = 'cDEcUdvKUsgvkZszC2w1yvzk4ZMX7d9LCKFdBI-XtVOK_ZMTAGsdLdNgLhvl9IpQvXJTStAqudf_ew';
      let puuidNikaro = 'jVrn-jVYqpiVRaBZWK1Q6hQ6r8fH8shXfXtT9MTUVj36hRoDewaay71ZJGzr1I0eQYemnEQTyk8ZeA';

      console.log(`[Init Ranks] Processing ${player.name} (IGN: ${player.ign})...`);

      if (isCorcho) {
        // Fetch Corcho main account PUUID dynamically if possible
        try {
          const accRes = await fetchWithRetry(`https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent('Corcho')}/FKC`);
          if (accRes.ok) {
            const accData = await accRes.json();
            puuidCorcho = accData.puuid || puuidCorcho;
            console.log(`[Init Ranks] Fetched Corcho main PUUID: ${puuidCorcho}`);
          }
        } catch (e) {
          console.error(`[Init Ranks] Failed to fetch Corcho main PUUID dynamically:`, e);
        }

        // Fetch Nikaro smurf account PUUID dynamically if possible
        try {
          const accRes = await fetchWithRetry(`https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Nikaro/PAINT`);
          if (accRes.ok) {
            const accData = await accRes.json();
            puuidNikaro = accData.puuid || puuidNikaro;
            console.log(`[Init Ranks] Fetched Nikaro smurf PUUID: ${puuidNikaro}`);
          }
        } catch (e) {
          console.error(`[Init Ranks] Failed to fetch Nikaro smurf PUUID dynamically:`, e);
        }

        puuid = puuidCorcho;
      }

      if (!puuid) {
        console.log(`[Init Ranks] Missing PUUID for ${player.name}, skipping.`);
        continue;
      }

      if (isCorcho) {
        let soloqMain: any = null;
        let soloqSmurf: any = null;

        try {
          const leagueResMain = await fetchWithRetry(`https://la2.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuidCorcho}`);
          if (leagueResMain.ok) {
            const leagues = await leagueResMain.json();
            soloqMain = leagues.find((l: any) => l.queueType === 'RANKED_SOLO_5x5');
          }
        } catch (e) {
          console.error(`[Init Ranks] Failed to fetch Corcho main rank:`, e);
        }

        try {
          const leagueResSmurf = await fetchWithRetry(`https://br1.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuidNikaro}`);
          if (leagueResSmurf.ok) {
            const leagues = await leagueResSmurf.json();
            soloqSmurf = leagues.find((l: any) => l.queueType === 'RANKED_SOLO_5x5');
          }
        } catch (e) {
          console.error(`[Init Ranks] Failed to fetch Nikaro smurf rank:`, e);
        }

        const eloMain = soloqMain ? getElo(soloqMain.tier, soloqMain.rank, soloqMain.leaguePoints) : 0;
        const eloSmurf = soloqSmurf ? getElo(soloqSmurf.tier, soloqSmurf.rank, soloqSmurf.leaguePoints) : 0;

        const targetRank = eloMain >= eloSmurf ? soloqMain : soloqSmurf;
        if (targetRank) {
          console.log(`[Init Ranks] Found SoloQ stats for Corcho higher rank: ${targetRank.tier} ${targetRank.rank} ${targetRank.leaguePoints}LP (Main ELO: ${eloMain}, Smurf ELO: ${eloSmurf})`);
          const { error: updateError } = await supabase.from('players').update({
            soloq_tier: targetRank.tier,
            soloq_rank: targetRank.rank,
            soloq_lp: targetRank.leaguePoints
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
    }

    return NextResponse.json({ success: true, updatedCount });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
