import { NextRequest, NextResponse } from 'next/server';
import { calculateScoreV3 } from '@/lib/score';
import { RiotMatchDTO, RiotParticipantDTO, RiotTeamDTO } from '@/lib/riot-types';
import { championIdMap } from '@/lib/champions';
import { refreshAnalyticsCache } from '@/lib/analytics';

const RIOT_API_KEY = process.env.RIOT_API_KEY;

const mapRiotRole = (riotRole: string): string => {
  const roleMap: Record<string, string> = {
    'TOP': 'top', 'JUNGLE': 'jungle', 'MIDDLE': 'mid', 'BOTTOM': 'adc', 'UTILITY': 'support',
  };
  return roleMap[riotRole] || 'top';
};

// Helper to pause execution briefly
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
  try {
    const { gameName, tagLine = "LAN", count = 10, start = 0 } = await request.json();

    if (!gameName) return NextResponse.json({ error: "GameName is required" }, { status: 400 });

    // 1. Get PUUID
    const accountRes = await fetch(
      `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY! } }
    );

    if (!accountRes.ok) {
      if (accountRes.status === 429) return NextResponse.json({ error: "Rate limit" }, { status: 429 });
      return NextResponse.json({ error: `Summoner not found. Status: ${accountRes.status}` }, { status: accountRes.status });
    }
    const { puuid } = await accountRes.json();

    // 2. Get Match IDs
    const matchesRes = await fetch(
      `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=440&start=${start}&count=${count}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY! } }
    );

    if (matchesRes.status === 429) return NextResponse.json({ error: "Rate limit" }, { status: 429 });
    const matchIds = await matchesRes.json();
    if (!matchIds || !matchIds.length) return NextResponse.json({ success: true, matches: [], rateLimited: false });

    // 3. Fetch Matches Safely
    const parsedMatches = [];

    for (const matchId of matchIds) {
      await delay(200); // Speed bump to prevent 20/sec limit

      const matchDataRes = await fetch(
        `https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`,
        { headers: { 'X-Riot-Token': RIOT_API_KEY! } }
      );

      // If we hit the 100/2min limit mid-batch, bail out immediately and send what we have
      if (matchDataRes.status === 429) {
        return NextResponse.json({
          success: true,
          matches: parsedMatches,
          rateLimited: true // Signals the frontend to wait 2 mins!
        });
      }

      if (!matchDataRes.ok) continue;

      const matchData = await matchDataRes.json() as RiotMatchDTO;
      if (!matchData.info || !matchData.info.participants) continue;

      const targetPlayer = matchData.info.participants.find((p: RiotParticipantDTO) => p.puuid === puuid);
      if (!targetPlayer) continue;

      const ourTeamId = targetPlayer.teamId;

      const durationMinutes = Math.max(1, Math.floor((matchData.info.gameDuration || 1800) / 60));

      const ourRiotParticipants = matchData.info.participants.filter((p: RiotParticipantDTO) => p.teamId === ourTeamId);
      const enemyRiotParticipants = matchData.info.participants.filter((p: RiotParticipantDTO) => p.teamId !== ourTeamId);

      const teamTotals = {
        teamKills: ourRiotParticipants.reduce((sum: number, p: RiotParticipantDTO) => sum + (p.kills || 0), 0),
        teamDamageDealt: ourRiotParticipants.reduce((sum: number, p: RiotParticipantDTO) => sum + (p.totalDamageDealtToChampions || 0), 0),
        teamDamageTaken: ourRiotParticipants.reduce((sum: number, p: RiotParticipantDTO) => sum + (p.totalDamageTaken || 0), 0),
      };

      const objectives = {
        dragons: ourRiotParticipants.reduce((sum: number, p: RiotParticipantDTO) => sum + (p.dragons || 0), 0),
        barons: ourRiotParticipants.reduce((sum: number, p: RiotParticipantDTO) => sum + (p.barons || 0), 0),
        hersalds: ourRiotParticipants.reduce((sum: number, p: RiotParticipantDTO) => sum + (p.riftHeraldTakedowns || 0), 0),
      };

      const teamParticipantsForV3 = ourRiotParticipants.map((p: RiotParticipantDTO) => ({
        kills: p.kills || 0,
        deaths: p.deaths || 0,
        assists: p.assists || 0,
        cs: (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0),
        goldEarned: p.goldEarned || 0,
        visionScore: p.visionScore || 0,
        damageDealt: p.totalDamageDealtToChampions || 0,
        damageTaken: p.totalDamageTaken || 0,
        champExperience: p.champExperience || 0,
        neutralMinionsKilled: p.neutralMinionsKilled || 0,
        damageDealtToObjectives: p.damageDealtToBuildings || 0,
        turretKills: p.turretTakedowns || 0,
        detectorWardsPlaced: p.detectorWardsPlaced || 0,
        wardsPlaced: p.wardsPlaced || 0,
        wardsCleared: p.wardsCleared || 0,
        teamPosition: p.teamPosition || 'TOP',
      }));

      const mapParticipant = (p: RiotParticipantDTO, isAlly: boolean) => {
        const role = mapRiotRole(p.teamPosition);
        const data = {
          riotId: `${p.riotIdGameName}#${p.riotIdTagline}`,
          puuid: p.puuid,
          role: role,
          champion: p.championName,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          cs: (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0),
          score: 0
        };

        if (isAlly) {
          const opponent = enemyRiotParticipants.find((e: RiotParticipantDTO) => e.teamPosition === p.teamPosition) || null;

          const playerData = {
            kills: p.kills || 0,
            deaths: p.deaths || 0,
            assists: p.assists || 0,
            cs: (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0),
            goldEarned: p.goldEarned || 0,
            visionScore: p.visionScore || 0,
            damageDealt: p.totalDamageDealtToChampions || 0,
            damageTaken: p.totalDamageTaken || 0,
            champExperience: p.champExperience || 0,
            neutralMinionsKilled: p.neutralMinionsKilled || 0,
            damageDealtToObjectives: p.damageDealtToBuildings || 0,
            turretKills: p.turretTakedowns || 0,
            detectorWardsPlaced: p.detectorWardsPlaced || 0,
            wardsPlaced: p.wardsPlaced || 0,
            wardsCleared: p.wardsCleared || 0,
            teamPosition: p.teamPosition || 'TOP',
          };

          const opponentData = opponent ? {
            teamPosition: opponent.teamPosition || 'TOP',
            kills: opponent.kills || 0,
            deaths: opponent.deaths || 0,
            assists: opponent.assists || 0,
            cs: (opponent.totalMinionsKilled || 0) + (opponent.neutralMinionsKilled || 0),
            goldEarned: opponent.goldEarned || 0,
            visionScore: opponent.visionScore || 0,
            champExperience: opponent.champExperience || 0,
            neutralMinionsKilled: opponent.neutralMinionsKilled || 0,
          } : null;

          data.score = calculateScoreV3(playerData, opponentData, teamTotals, durationMinutes, role, objectives, teamParticipantsForV3);
        }

        return data;
      };

      const our_participants = ourRiotParticipants.map((p: RiotParticipantDTO) => mapParticipant(p, true));
      const enemy_participants = enemyRiotParticipants.map((p: RiotParticipantDTO) => mapParticipant(p, false));

      const ourTeamData = matchData.info.teams.find((t: RiotTeamDTO) => t.teamId === ourTeamId);
      const enemyTeamData = matchData.info.teams.find((t: RiotTeamDTO) => t.teamId !== ourTeamId);

      const our_bans = ourTeamData?.bans ? ourTeamData.bans.map((b: {championId: number}) => championIdMap[b.championId] || 'Unknown') : [];
      const enemy_bans = enemyTeamData?.bans ? enemyTeamData.bans.map((b: {championId: number}) => championIdMap[b.championId] || 'Unknown') : [];

      parsedMatches.push({
        matchId,
        date: new Date(matchData.info.gameCreation).toISOString().slice(0, 16),
        match_type: 'flex',
        our_side: ourTeamId === 100 ? 'Blue' : 'Red',
        we_won: targetPlayer.win,
        duration_minutes: Math.floor(matchData.info.gameDuration / 60),
        duration_seconds: matchData.info.gameDuration % 60,
        our_bans,
        enemy_bans,
        our_participants,
        enemy_participants
      });
    }

    // Auto-refresh the cache so the UI updates instantly
    await refreshAnalyticsCache();

    return NextResponse.json({
      success: true,
      matches: parsedMatches,
      rateLimited: false
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}