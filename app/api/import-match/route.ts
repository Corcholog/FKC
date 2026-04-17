import { NextRequest, NextResponse } from 'next/server';

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
    let { matchId, gameName = "Corshus", tagLine = "2108" } = await request.json();

    if (!matchId) return NextResponse.json({ error: "matchId is required" }, { status: 400 });

    matchId = matchId.includes('_') ? matchId : `LA2_${matchId}`;

    // 1. Get PUUID
    const accountRes = await fetch(
      `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY! } }
    );

    if (!accountRes.ok) {
      if (accountRes.status === 429) return NextResponse.json({ error: "Rate limit getting PUUID" }, { status: 429 });
      return NextResponse.json({ error: `Riot Account not found. Status: ${accountRes.status}` }, { status: accountRes.status });
    }
    const { puuid } = await accountRes.json();

    // 2. Fetch Match
    const matchDataRes = await fetch(
      `https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY! } }
    );

    if (!matchDataRes.ok) {
      if (matchDataRes.status === 429) return NextResponse.json({ error: "Rate limit getting Match" }, { status: 429 });
      return NextResponse.json({ error: `Match not found. Ensure ID is correct. Status: ${matchDataRes.status}` }, { status: matchDataRes.status });
    }

    const matchData = await matchDataRes.json();
    if (!matchData.info || !matchData.info.participants) {
      return NextResponse.json({ error: "Invalid match data structure" }, { status: 400 });
    }

    const targetPlayer = matchData.info.participants.find((p: any) => p.puuid === puuid);
    let ourTeamId = 100;
    
    if (targetPlayer) {
      ourTeamId = targetPlayer.teamId;
    }

    const mapParticipant = (p: any) => ({
      riotId: `${p.riotIdGameName}#${p.riotIdTagline}`,
      puuid: p.puuid,
      role: mapRiotRole(p.teamPosition),
      champion: p.championName,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      cs: p.totalMinionsKilled + p.neutralMinionsKilled
    });
    
    const our_participants = matchData.info.participants.filter((p: any) => p.teamId === ourTeamId).map(mapParticipant);
    const enemy_participants = matchData.info.participants.filter((p: any) => p.teamId !== ourTeamId).map(mapParticipant);

    const ourTeamData = matchData.info.teams.find((t: any) => t.teamId === ourTeamId);
    const enemyTeamData = matchData.info.teams.find((t: any) => t.teamId !== ourTeamId);

    const our_bans = ourTeamData?.bans ? ourTeamData.bans.map((b: any) => championIdMap[b.championId] || 'Unknown') : [];
    const enemy_bans = enemyTeamData?.bans ? enemyTeamData.bans.map((b: any) => championIdMap[b.championId] || 'Unknown') : [];

    const parsedMatch = {
      matchId: matchData.metadata.matchId, // Keep full LA2_ prefix here since AdminForm strips it later
      date: new Date(matchData.info.gameCreation).toISOString().slice(0, 16),
      match_type: 'tournament',
      our_side: ourTeamId === 100 ? 'Blue' : 'Red',
      we_won: ourTeamData?.win || false,
      duration_minutes: Math.floor(matchData.info.gameDuration / 60),
      duration_seconds: matchData.info.gameDuration % 60,
      our_bans,
      enemy_bans,
      our_participants,
      enemy_participants
    };

    return NextResponse.json({ success: true, match: parsedMatch });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}