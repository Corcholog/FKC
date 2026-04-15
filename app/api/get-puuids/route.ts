import { NextResponse } from 'next/server';

const RIOT_API_KEY = process.env.RIOT_API_KEY;

// Put your current 5 Riot IDs here
const myTeam = [
  { gameName: "volvé camila", tagLine: "MISSU" }, // Update these to whatever they are RIGHT NOW
  { gameName: "maldito gauci", tagLine: "FKC" },
  { gameName: "we1rdcat", tagLine: "uwu" },
  { gameName: "Zair", tagLine: "zaza" },
  { gameName: "l étrange cas", tagLine: "FKC" }
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function GET() {
  const results = [];

  for (const player of myTeam) {
    await delay(100);
    const res = await fetch(
      `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(player.gameName)}/${encodeURIComponent(player.tagLine)}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY! } }
    );
    
    if (res.ok) {
      const data = await res.json();
      results.push({ name: player.gameName, puuid: data.puuid });
    } else {
      results.push({ name: player.gameName, error: `Status ${res.status}` });
    }
  }

  return NextResponse.json(results);
}