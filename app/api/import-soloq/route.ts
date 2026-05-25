import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { RiotLeagueEntryDTO, RiotMatchDTO, RiotParticipantDTO } from '@/lib/riot-types';
import { refreshAnalyticsCache } from '@/lib/analytics';
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

    // Start of season date (As requested: Today's exact date)
    const startTime = Math.floor(new Date('2026-04-29T00:00:00Z').getTime() / 1000);

    let totalAddedCount = 0;

    for (const player of players) {
      let puuid = player.puuid;
      const isCorcho = player.name === 'Corcho';
      let puuidCorcho = 'cDEcUdvKUsgvkZszC2w1yvzk4ZMX7d9LCKFdBI-XtVOK_ZMTAGsdLdNgLhvl9IpQvXJTStAqudf_ew';
      let puuidNikaro = 'jVrn-jVYqpiVRaBZWK1Q6hQ6r8fH8shXfXtT9MTUVj36hRoDewaay71ZJGzr1I0eQYemnEQTyk8ZeA';

      if (isCorcho) {
        // Fetch Corcho main account PUUID dynamically if possible
        try {
          const accRes = await fetchWithRetry(`https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent('Corcho')}/FKC`);
          if (accRes.ok) {
            const accData = await accRes.json();
            puuidCorcho = accData.puuid || puuidCorcho;
            console.log(`[Import SoloQ] Fetched Corcho main PUUID: ${puuidCorcho}`);
          }
        } catch (e) {
          console.error(`[Import SoloQ] Failed to fetch Corcho main PUUID dynamically:`, e);
        }

        // Fetch Nikaro smurf account PUUID dynamically if possible
        try {
          const accRes = await fetchWithRetry(`https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Nikaro/PAINT`);
          if (accRes.ok) {
            const accData = await accRes.json();
            puuidNikaro = accData.puuid || puuidNikaro;
            console.log(`[Import SoloQ] Fetched Nikaro smurf PUUID: ${puuidNikaro}`);
          }
        } catch (e) {
          console.error(`[Import SoloQ] Failed to fetch Nikaro smurf PUUID dynamically:`, e);
        }

        puuid = puuidCorcho;
      }

      if (!puuid) continue;

      // 1. Fetch Ranked Stats
      if (isCorcho) {
        let soloqMain: any = null;
        let soloqSmurf: any = null;

        try {
          const leagueResMain = await fetchWithRetry(`https://la2.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuidCorcho}`);
          if (leagueResMain.ok) {
            const leagues = await leagueResMain.json();
            soloqMain = leagues.find((l: RiotLeagueEntryDTO) => l.queueType === 'RANKED_SOLO_5x5');
          }
        } catch (e) {
          console.error(`[Import SoloQ] Failed to fetch Corcho main rank:`, e);
        }

        try {
          const leagueResSmurf = await fetchWithRetry(`https://br1.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuidNikaro}`);
          if (leagueResSmurf.ok) {
            const leagues = await leagueResSmurf.json();
            soloqSmurf = leagues.find((l: RiotLeagueEntryDTO) => l.queueType === 'RANKED_SOLO_5x5');
          }
        } catch (e) {
          console.error(`[Import SoloQ] Failed to fetch Nikaro smurf rank:`, e);
        }

        const eloMain = soloqMain ? getElo(soloqMain.tier, soloqMain.rank, soloqMain.leaguePoints) : 0;
        const eloSmurf = soloqSmurf ? getElo(soloqSmurf.tier, soloqSmurf.rank, soloqSmurf.leaguePoints) : 0;

        const targetRank = eloMain >= eloSmurf ? soloqMain : soloqSmurf;
        if (targetRank) {
          await supabase.from('players').update({
            soloq_tier: targetRank.tier,
            soloq_rank: targetRank.rank,
            soloq_lp: targetRank.leaguePoints
          }).eq('id', player.id);
          console.log(`[Import SoloQ] Corcho higher rank updated: ${targetRank.tier} ${targetRank.rank} ${targetRank.leaguePoints}LP (Main ELO: ${eloMain}, Smurf ELO: ${eloSmurf})`);
        }
      } else {
        const leagueRes = await fetchWithRetry(`https://la2.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`);
        if (leagueRes.ok) {
          const leagues = await leagueRes.json();
          const soloq = leagues.find((l: RiotLeagueEntryDTO) => l.queueType === 'RANKED_SOLO_5x5');
          if (soloq) {
            await supabase.from('players').update({
              soloq_tier: soloq.tier,
              soloq_rank: soloq.rank,
              soloq_lp: soloq.leaguePoints
            }).eq('id', player.id);
          }
        }
      }

      // 3. Fetch Match History for all accounts
      const puuidsToFetch = isCorcho ? [puuidCorcho, puuidNikaro] : [puuid];

      for (const activePuuid of puuidsToFetch) {
        if (!activePuuid) continue;
        let startIdx = 0;
        let hasMore = true;
        const count = 20;

        // Get all existing soloq match IDs for this player to optimize check
        const { data: existingMatches } = await supabase
          .from('soloq_matches')
          .select('match_id')
          .eq('player_id', player.id);

        const existingMatchIds = new Set(existingMatches?.map(m => m.match_id) || []);

        while (hasMore) {
          const url = `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${activePuuid}/ids?queue=420&startTime=${startTime}&start=${startIdx}&count=${count}`;
          const matchesRes = await fetchWithRetry(url);

          if (!matchesRes.ok) {
            if (matchesRes.status === 429) throw new Error("Rate limit exceeded permanently");
            break; // Stop fetching matches for this account
          }

          const matchIds = await matchesRes.json();
          if (!matchIds || matchIds.length === 0) {
            hasMore = false;
            break;
          }

          let newMatchesFound = false;

          for (const matchId of matchIds) {
            if (existingMatchIds.has(matchId)) {
              continue;
            }

            newMatchesFound = true;
            await delay(100); // Throttling

            const matchDataRes = await fetchWithRetry(`https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`);
            if (!matchDataRes.ok) continue;

            const matchData = await matchDataRes.json() as RiotMatchDTO;
            if (!matchData.info || !matchData.info.participants) continue;

            const isRemake = matchData.info.gameDuration < 300 || matchData.info.participants.some((p: RiotParticipantDTO) => p.gameEndedInEarlySurrender);

            if (isRemake) {
              existingMatchIds.add(matchId);
              continue;
            }

            const targetParticipant = matchData.info.participants.find((p: RiotParticipantDTO) => 
              isCorcho 
                ? (p.puuid === puuidCorcho || p.puuid === puuidNikaro)
                : p.puuid === activePuuid
            );
            if (!targetParticipant) continue;

            const durationSecondsTotal = matchData.info.gameDuration;
            const isMilliseconds = durationSecondsTotal > 50000;
            const totalSeconds = isMilliseconds ? Math.floor(durationSecondsTotal / 1000) : durationSecondsTotal;
            const duration_minutes = Math.max(1, Math.floor(totalSeconds / 60));
            const duration_seconds = totalSeconds % 60;

            const riotRoleMap: Record<string, string> = { 'TOP': 'top', 'JUNGLE': 'jungle', 'MIDDLE': 'mid', 'BOTTOM': 'adc', 'UTILITY': 'support' };
            const role = riotRoleMap[targetParticipant.teamPosition] || 'mid';

            const targetTeamId = targetParticipant.teamId;
            const teammates = matchData.info.participants.filter((p: any) => p.teamId === targetTeamId);
            const team_total_kills = teammates.reduce((sum: number, p: any) => sum + (p.kills || 0), 0);
            const team_total_deaths = teammates.reduce((sum: number, p: any) => sum + (p.deaths || 0), 0);
            const team_total_damage = teammates.reduce((sum: number, p: any) => sum + (p.totalDamageDealtToChampions || 0), 0);
            const team_total_gold = teammates.reduce((sum: number, p: any) => sum + (p.goldEarned || 0), 0);

            await supabase.from('soloq_matches').insert({
              player_id: player.id,
              match_id: matchId,
              date: new Date(matchData.info.gameCreation).toISOString(),
              champion: targetParticipant.championName,
              kills: targetParticipant.kills || 0,
              deaths: targetParticipant.deaths || 0,
              assists: targetParticipant.assists || 0,
              cs: (targetParticipant.totalMinionsKilled || 0) + (targetParticipant.neutralMinionsKilled || 0),
              win: targetParticipant.win,
              role: role,
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
            });

            existingMatchIds.add(matchId);
            totalAddedCount++;
          }

          if (!newMatchesFound) {
            hasMore = false;
          } else {
            startIdx += count;
          }
        }
      }
    }

    // Auto-refresh the cache so the UI updates instantly
    await refreshAnalyticsCache();

    return NextResponse.json({ success: true, addedCount: totalAddedCount });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
