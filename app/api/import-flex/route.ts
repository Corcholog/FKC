import { NextRequest, NextResponse } from 'next/server';
import { calculateScoreV3 } from '@/lib/score';

const RIOT_API_KEY = process.env.RIOT_API_KEY;

const championIdMap: Record<number, string> = {
  '-1': 'None', 1: 'Annie', 2: 'Olaf', 3: 'Galio', 4: 'Twisted Fate', 5: 'Xin Zhao', 6: 'Urgot', 7: 'LeBlanc', 8: 'Vladimir', 9: 'Fiddlesticks', 10: 'Kayle', 11: 'Master Yi', 12: 'Alistar', 13: 'Ryze', 14: 'Sion', 15: 'Sivir', 16: 'Soraka', 17: 'Teemo', 18: 'Tristana', 19: 'Warwick', 20: 'Nunu & Willump', 21: 'Miss Fortune', 22: 'Ashe', 23: 'Tryndamere', 24: 'Jax', 25: 'Morgana', 26: 'Zilean', 27: 'Singed', 28: 'Evelynn', 29: 'Twitch', 30: 'Karthus', 31: "Cho'Gath", 32: 'Amumu', 33: 'Rammus', 34: 'Anivia', 35: 'Shaco', 36: 'Dr. Mundo', 37: 'Sona', 38: 'Kassadin', 39: 'Irelia', 40: 'Janna', 41: 'Gangplank', 42: 'Corki', 43: 'Karma', 44: 'Taric', 45: 'Veigar', 48: 'Trundle', 50: 'Swain', 51: 'Caitlyn', 53: 'Blitzcrank', 54: 'Malphite', 55: 'Katarina', 56: 'Nocturne', 57: 'Maokai', 58: 'Renekton', 59: 'Jarvan IV', 60: 'Elise', 61: 'Orianna', 62: 'Wukong', 63: 'Brand', 64: 'Lee Sin', 67: 'Vayne', 68: 'Rumble', 69: 'Cassiopeia', 72: 'Skarner', 74: 'Heimerdinger', 75: 'Nasus', 76: 'Nidalee', 77: 'Udyr', 78: 'Poppy', 79: 'Gragas', 80: 'Pantheon', 81: 'Ezreal', 82: 'Mordekaiser', 83: 'Yorick', 84: 'Akali', 85: 'Kennen', 86: 'Garen', 89: 'Leona', 90: 'Malzahar', 91: 'Talon', 92: 'Riven', 96: "Kog'Maw", 98: 'Shen', 99: 'Lux', 101: 'Xerath', 102: 'Shyvana', 103: 'Ahri', 104: 'Graves', 105: 'Fizz', 106: 'Volibear', 107: 'Rengar', 110: 'Varus', 111: 'Nautilus', 112: 'Viktor', 113: 'Sejuani', 114: 'Fiora', 115: 'Ziggs', 117: 'Lulu', 119: 'Draven', 120: 'Hecarim', 121: "Kha'Zix", 122: 'Darius', 126: 'Jayce', 127: 'Lissandra', 131: 'Diana', 133: 'Quinn', 134: 'Syndra', 136: 'Aurelion Sol', 141: 'Kayn', 142: 'Zoe', 143: 'Zyra', 145: "Kai'Sa", 147: 'Seraphine', 150: 'Gnar', 154: 'Zac', 157: 'Yasuo', 161: "Vel'Koz", 163: 'Taliyah', 164: 'Camille', 166: 'Akshan', 200: "Bel'Veth", 221: 'Zeri', 222: 'Jinx', 223: 'Tahm Kench', 233: 'Briar', 234: 'Viego', 235: 'Senna', 236: 'Lucian', 238: 'Zed', 240: 'Kled', 245: 'Ekko', 246: 'Qiyana', 254: 'Vi', 266: 'Aatrox', 267: 'Nami', 268: 'Azir', 350: 'Yuumi', 360: 'Samira', 412: 'Thresh', 420: 'Illaoi', 421: "Rek'Sai", 427: 'Ivern', 429: 'Kalista', 432: 'Bard', 497: 'Rakan', 498: 'Xayah', 516: 'Ornn', 517: 'Sylas', 518: 'Neeko', 523: 'Aphelios', 526: 'Rell', 555: 'Pyke', 711: 'Vex', 777: 'Yone', 799: 'Ambessa', 875: 'Sett', 876: 'Lillia', 887: 'Gwen', 888: 'Renata Glasc', 893: 'Aurora', 895: 'Nilah', 897: "K'Sante", 901: 'Smolder', 902: 'Milio', 910: 'Hwei', 950: 'Naafiri', 999: 'Mel'
};

const mapRiotRole = (riotRole: string): string => {
  const roleMap: Record<string, string> = {
    'TOP': 'Top', 'JUNGLE': 'Jungle', 'MIDDLE': 'Mid', 'BOTTOM': 'ADC', 'UTILITY': 'Support',
  };
  return roleMap[riotRole] || 'Top';
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

      const matchData = await matchDataRes.json();
      if (!matchData.info || !matchData.info.participants) continue;

      const targetPlayer = matchData.info.participants.find((p: any) => p.puuid === puuid);
      if (!targetPlayer) continue;

      const ourTeamId = targetPlayer.teamId;

      const durationMinutes = Math.max(1, Math.floor((matchData.info.gameDuration || 1800) / 60));

      const ourRiotParticipants = matchData.info.participants.filter((p: any) => p.teamId === ourTeamId);
      const enemyRiotParticipants = matchData.info.participants.filter((p: any) => p.teamId !== ourTeamId);

      const teamTotals = {
        teamKills: ourRiotParticipants.reduce((sum: number, p: any) => sum + (p.kills || 0), 0),
        teamDamageDealt: ourRiotParticipants.reduce((sum: number, p: any) => sum + (p.totalDamageDealtToChampions || 0), 0),
        teamDamageTaken: ourRiotParticipants.reduce((sum: number, p: any) => sum + (p.totalDamageTaken || 0), 0),
      };

      const objectives = {
        dragons: ourRiotParticipants.reduce((sum: number, p: any) => sum + (p.dragons || 0), 0),
        barons: ourRiotParticipants.reduce((sum: number, p: any) => sum + (p.barons || 0), 0),
        hersalds: ourRiotParticipants.reduce((sum: number, p: any) => sum + (p.riftHeraldTakedowns || 0), 0),
      };

      const teamParticipantsForV3 = ourRiotParticipants.map((p: any) => ({
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

      const mapParticipant = (p: any, isAlly: boolean) => {
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
          const opponent = enemyRiotParticipants.find((e: any) => e.teamPosition === p.teamPosition) || null;

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

      const our_participants = ourRiotParticipants.map((p: any) => mapParticipant(p, true));
      const enemy_participants = enemyRiotParticipants.map((p: any) => mapParticipant(p, false));

      const ourTeamData = matchData.info.teams.find((t: any) => t.teamId === ourTeamId);
      const enemyTeamData = matchData.info.teams.find((t: any) => t.teamId !== ourTeamId);

      const our_bans = ourTeamData?.bans ? ourTeamData.bans.map((b: any) => championIdMap[b.championId] || 'Unknown') : [];
      const enemy_bans = enemyTeamData?.bans ? enemyTeamData.bans.map((b: any) => championIdMap[b.championId] || 'Unknown') : [];

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

    return NextResponse.json({
      success: true,
      matches: parsedMatches,
      rateLimited: false
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}