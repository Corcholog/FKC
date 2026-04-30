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

    // Start of season date (As requested: Today's exact date)
    const startTime = Math.floor(new Date('2026-04-29T00:00:00Z').getTime() / 1000);

    let totalAddedCount = 0;

    for (const player of players) {
      let puuid = player.puuid;

      if (!puuid) continue;

      // 1. Fetch Ranked Stats using PUUID
      const leagueRes = await fetchWithRetry(`https://la2.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`);
      if (leagueRes.ok) {
        const leagues = await leagueRes.json();
        const soloq = leagues.find((l: any) => l.queueType === 'RANKED_SOLO_5x5');
        if (soloq) {
          await supabase.from('players').update({
            soloq_tier: soloq.tier,
            soloq_rank: soloq.rank,
            soloq_lp: soloq.leaguePoints
          }).eq('id', player.id);
        }
      }

      // 3. Fetch Match History
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
        const url = `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&startTime=${startTime}&start=${startIdx}&count=${count}`;
        const matchesRes = await fetchWithRetry(url);

        if (!matchesRes.ok) {
          if (matchesRes.status === 429) throw new Error("Rate limit exceeded permanently");
          break; // Stop fetching matches for this player on other errors
        }

        const matchIds = await matchesRes.json();
        if (!matchIds || matchIds.length === 0) {
          hasMore = false;
          break;
        }

        let newMatchesFound = false;

        for (const matchId of matchIds) {
          if (existingMatchIds.has(matchId)) {
            // We've hit a match we already processed, meaning all subsequent older matches are also likely processed.
            // But just in case, we continue the loop. We could also break early here to save calls.
            continue;
          }

          newMatchesFound = true;
          await delay(100); // Throttling

          const matchDataRes = await fetchWithRetry(`https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`);
          if (!matchDataRes.ok) continue;

          const matchData = await matchDataRes.json();
          if (!matchData.info || !matchData.info.participants) continue;

          const isRemake = matchData.info.gameDuration < 300 || matchData.info.participants.some((p: any) => p.gameEndedInEarlySurrender);

          if (isRemake) {
            existingMatchIds.add(matchId);
            continue;
          }

          const targetParticipant = matchData.info.participants.find((p: any) => p.puuid === puuid);
          if (!targetParticipant) continue;

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
            role: targetParticipant.teamPosition || 'NONE'
          });

          existingMatchIds.add(matchId);
          totalAddedCount++;
        }

        // If no new matches were found in this entire batch of 20, we assume we've reached the point where everything is already in DB.
        if (!newMatchesFound) {
          hasMore = false;
        } else {
          startIdx += count;
        }
      }
    }

    return NextResponse.json({ success: true, addedCount: totalAddedCount });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
