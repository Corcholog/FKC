'use client'
import { useState, useMemo } from 'react'
import Image from 'next/image'
import PlayerLinks from '@/app/components/PlayerLinks'

// Color Helpers
const getColorWR = (wr: number) => {
  if (wr >= 60) return 'text-blue-400'
  if (wr >= 53) return 'text-green-400'
  if (wr >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

const getColorKDA = (kda: number) => {
  if (kda >= 3.6) return 'text-blue-400'
  if (kda >= 3.0) return 'text-green-400'
  if (kda >= 2.0) return 'text-yellow-400'
  return 'text-red-400'
}

const getColorAvgScore = (score: number) => {
  if (score >= 60) return 'text-blue-500'
  if (score >= 40) return 'text-green-500'
  if (score >= 25) return 'text-yellow-500'
  return 'text-rose-500'
}

const getTierBorderColor = (tier: string) => {
  switch (tier?.toUpperCase()) {
    case 'IRON': return 'border-gray-500 shadow-[0_0_15px_rgba(107,114,128,0.3)]'
    case 'BRONZE': return 'border-amber-700 shadow-[0_0_15px_rgba(180,83,9,0.3)]'
    case 'SILVER': return 'border-slate-400 shadow-[0_0_15px_rgba(148,163,184,0.3)]'
    case 'GOLD': return 'border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.3)]'
    case 'PLATINUM': return 'border-teal-400 shadow-[0_0_15px_rgba(45,212,191,0.3)]'
    case 'EMERALD': return 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
    case 'DIAMOND': return 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
    case 'MASTER': return 'border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
    case 'GRANDMASTER': return 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
    case 'CHALLENGER': return 'border-cyan-300 shadow-[0_0_15px_rgba(103,232,249,0.5)]'
    default: return 'border-zinc-200 dark:border-[#322814]'
  }
}

const getTierTextColor = (tier: string) => {
  switch (tier?.toUpperCase()) {
    case 'IRON': return 'text-gray-500'
    case 'BRONZE': return 'text-amber-700'
    case 'SILVER': return 'text-slate-400'
    case 'GOLD': return 'text-yellow-400'
    case 'PLATINUM': return 'text-teal-400'
    case 'EMERALD': return 'text-emerald-500'
    case 'DIAMOND': return 'text-blue-500'
    case 'MASTER': return 'text-purple-500'
    case 'GRANDMASTER': return 'text-red-500'
    case 'CHALLENGER': return 'text-cyan-300'
    default: return 'text-slate-500'
  }
}

const ROLE_ORDER = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT']

const allChampions = [
  "Aatrox", "Ahri", "Akali", "Akshan", "Alistar", "Ambessa", "Amumu", "Anivia", "Annie", "Aphelios",
  "Ashe", "Aurelion Sol", "Aurora", "Azir", "Bard", "Bel'Veth", "Blitzcrank", "Brand", "Braum", "Briar",
  "Caitlyn", "Camille", "Cassiopeia", "Cho'Gath", "Corki", "Darius", "Diana", "Dr. Mundo", "Draven",
  "Ekko", "Elise", "Evelynn", "Ezreal", "Fiddlesticks", "Fiora", "Fizz", "Galio", "Gangplank", "Garen",
  "Gnar", "Gragas", "Graves", "Gwen", "Hecarim", "Heimerdinger", "Hwei", "Illaoi", "Irelia", "Ivern",
  "Janna", "Jarvan IV", "Jax", "Jayce", "Jhin", "Jinx", "K'Sante", "Kai'Sa", "Kalista", "Karma",
  "Karthus", "Kassadin", "Katarina", "Kayle", "Kayn", "Kennen", "Kha'Zix", "Kindred", "Kled", "Kog'Maw",
  "LeBlanc", "Lee Sin", "Leona", "Lillia", "Lissandra", "Lucian", "Lulu", "Lux", "Malphite", "Malzahar",
  "Maokai", "Master Yi", "Mel", "Milio", "Miss Fortune", "Mordekaiser", "Morgana", "Naafiri", "Nami",
  "Nasus", "Nautilus", "Neeko", "Nidalee", "Nilah", "Nocturne", "Nunu & Willump", "Olaf", "Orianna",
  "Ornn", "Pantheon", "Poppy", "Pyke", "Qiyana", "Quinn", "Rakan", "Rammus", "Rek'Sai", "Rell",
  "Renata Glasc", "Renekton", "Rengar", "Riven", "Rumble", "Ryze", "Samira", "Sejuani", "Senna",
  "Seraphine", "Sett", "Shaco", "Shen", "Shyvana", "Singed", "Sion", "Sivir", "Skarner", "Smolder",
  "Sona", "Soraka", "Swain", "Sylas", "Syndra", "Tahm Kench", "Taliyah", "Talon", "Taric", "Teemo",
  "Thresh", "Tristana", "Trundle", "Tryndamere", "Twisted Fate", "Twitch", "Udyr", "Urgot", "Varus",
  "Vayne", "Veigar", "Vel'Koz", "Vex", "Vi", "Viego", "Viktor", "Vladimir", "Volibear", "Warwick",
  "Wukong", "Xayah", "Xerath", "Xin Zhao", "Yasuo", "Yone", "Yorick", "Yunara", "Yuumi", "Zaahen",
  "Zac", "Zed", "Zeri", "Ziggs", "Zilean", "Zoe", "Zyra"
].sort()

const getChampionIcon = (name: string): string | null => {
  if (!name?.trim()) return null
  const normalize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  const match = allChampions.find(c => normalize(c) === normalize(name))
  if (!match) return null
  const overrides: Record<string, string> = { "Bel'Veth": "Belveth", "Cho'Gath": "Chogath", "Kai'Sa": "Kaisa", "Kha'Zix": "Khazix", "K'Sante": "KSante", "Rek'Sai": "RekSai", "Vel'Koz": "Velkoz", "Wukong": "MonkeyKing", "LeBlanc": "Leblanc", "RenataGlasc": "Renata" }
  const key = overrides[match] ?? match.replace(/[^a-zA-Z0-9]/g, '')
  return `https://ddragon.leagueoflegends.com/cdn/16.7.1/img/champion/${key}.png`
}

interface RosterSectionProps {
  playerList: any[];
  teamPerformances: any[];
  soloqPerformances: any[];
}

type Mode = 'team' | 'soloq' | 'mixed';

export default function RosterSection({ playerList, teamPerformances, soloqPerformances }: RosterSectionProps) {
  const [mode, setMode] = useState<Mode>('team');

  const rosterStats = useMemo(() => {
    // Group team performances by match to determine MVP and INT per match
    const matchPerformances: Record<number, any[]> = {}
    teamPerformances.forEach((row: any) => {
      const matchId = row.matches?.id
      if (matchId) {
        if (!matchPerformances[matchId]) matchPerformances[matchId] = []
        matchPerformances[matchId].push(row)
      }
    })

    const playerMvpIntCounts: Record<number, { mvpCount: number; intMvpCount: number }> = {}
    Object.values(matchPerformances).forEach(playersInMatch => {
      const scoredPlayers = playersInMatch.filter((p: any) => typeof p.score === 'number' && p.score > 0)
      if (scoredPlayers.length < 2) return

      const sorted = [...scoredPlayers].sort((a, b) => b.score - a.score)
      const mvpPlayerId = sorted[0].player_id
      const intPlayerId = sorted[sorted.length - 1].player_id

      if (mvpPlayerId) {
        playerMvpIntCounts[mvpPlayerId] = playerMvpIntCounts[mvpPlayerId] || { mvpCount: 0, intMvpCount: 0 }
        playerMvpIntCounts[mvpPlayerId].mvpCount++
      }
      if (intPlayerId && intPlayerId !== mvpPlayerId) {
        playerMvpIntCounts[intPlayerId] = playerMvpIntCounts[intPlayerId] || { mvpCount: 0, intMvpCount: 0 }
        playerMvpIntCounts[intPlayerId].intMvpCount++
      }
    })

    const stats = playerList.map(player => {
      const tMatches = teamPerformances.filter(p => p.player_id === player.id);
      const sMatches = soloqPerformances.filter(p => p.player_id === player.id);

      let wins = 0;
      let kills = 0;
      let deaths = 0;
      let assists = 0;
      let totalScore = 0;
      const mvpCount = playerMvpIntCounts[player.id]?.mvpCount || 0;
      const intMvpCount = playerMvpIntCounts[player.id]?.intMvpCount || 0;
      const champStats: Record<string, { games: number, wins: number, kills: number, deaths: number, assists: number }> = {};

      let gamesWithScore = 0;
      let totalGames = 0;

      const processMatch = (champion: string, win: boolean, k: number, d: number, a: number, score?: number) => {
        totalGames++;
        if (win) wins++;
        kills += k || 0;
        deaths += d || 0;
        assists += a || 0;

        if (typeof score === 'number' && score > 0) {
          totalScore += score;
          gamesWithScore++;
        }

        if (!champStats[champion]) {
          champStats[champion] = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
        }
        champStats[champion].games++;
        if (win) champStats[champion].wins++;
        champStats[champion].kills += k || 0;
        champStats[champion].deaths += d || 0;
        champStats[champion].assists += a || 0;
      };

      if (mode === 'team' || mode === 'mixed') {
        tMatches.forEach((row: any) => {
          processMatch(row.champion, row.matches?.we_won, row.kills, row.deaths, row.assists, row.score);
        });
      }

      if (mode === 'soloq' || mode === 'mixed') {
        sMatches.forEach((row: any) => {
          processMatch(row.champion, row.win, row.kills, row.deaths, row.assists);
        });
      }

      const winrate = totalGames > 0 ? (wins / totalGames) * 100 : 0;
      const overallKda = deaths === 0 ? (kills + assists) : (kills + assists) / deaths;
      const avgScore = gamesWithScore > 0 ? totalScore / gamesWithScore : 0;

      const topChampions = Object.entries(champStats)
        .map(([name, stats]) => {
          const champWinrate = (stats.wins / stats.games) * 100
          const champKda = stats.deaths === 0
            ? (stats.kills + stats.assists)
            : (stats.kills + stats.assists) / stats.deaths

          return {
            name,
            games: stats.games,
            winrate: champWinrate,
            kda: isNaN(champKda) ? 0 : Number(champKda.toFixed(2))
          }
        })
        .sort((a, b) => b.games - a.games)
        .slice(0, 5)

      return {
        ...player,
        totalGames,
        wins,
        losses: totalGames - wins,
        winrate: Number(winrate.toFixed(1)),
        overallKda: Number(overallKda.toFixed(2)),
        avgScore: Number(avgScore.toFixed(1)),
        mvpCount,
        intMvpCount,
        topChampions
      }
    });

    stats.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
    return stats;
  }, [playerList, teamPerformances, soloqPerformances, mode]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <h2 className="text-4xl font-bold mb-6 text-center">Our Roster</h2>

      {/* Mode Toggle */}
      <div className="flex justify-center mb-10">
        <div className="inline-flex bg-card border border-blue-200 dark:border-[#322814] p-1 shadow-sm">
          {(['team', 'soloq', 'mixed'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-6 py-2 text-sm font-bold transition-all capitalize ${mode === m
                  ? 'bg-[#f1c40f] text-slate-900 shadow-md border border-[#f39c12]'
                  : 'text-slate-600 dark:text-slate-300 hover:text-[#f39c12]'
                }`}
            >
              {m === 'team' ? 'Team Stats' : m === 'soloq' ? 'SoloQ Stats' : 'Mixed Stats'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {rosterStats.length > 0 ? rosterStats.map((stat: any) => (
          <div
            key={stat.id}
            className={`bg-card overflow-hidden flex flex-col transition-all duration-300 ${mode === 'soloq'
                ? `border-2 hover:scale-[1.02] ${getTierBorderColor(stat.soloq_tier)}`
                : 'border border-zinc-200 dark:border-[#322814] hover:border-yellow-400 dark:hover:border-[#c8aa6e]'
              }`}
          >
            {/* IMAGE TOP */}
            <div className="h-[300px] relative overflow-hidden">
              <img
                src={`/players/${stat.name.toLowerCase().replace(/\s+/g, '')}.jpg`}
                alt=""
                className="w-full h-full object-cover object-top transition duration-500 hover:scale-105"
              />
            </div>

            {/* CONTENT */}
            <div className="p-5 flex flex-col flex-1">

              {/* NAME + ROLE */}
              <div className={`text-center mb-4 relative ${mode === 'soloq' ? 'pb-4 border-b border-slate-200 dark:border-[#322814]' : ''}`}>
                <PlayerLinks ign={stat.ign} className="mb-3" />
                <div className="text-yellow-600 font-bold text-xs tracking-widest uppercase">
                  {stat.role}
                </div>
                <div className="text-3xl font-black mt-1 text-foreground uppercase tracking-wider">
                  {stat.name}
                </div>
              </div>

              {/* ELO Display */}
              {mode === 'soloq' && (
                <div className="text-center mb-4">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold mb-1">Current Rank</p>
                  <p className={`text-xl font-black uppercase tracking-wide ${getTierTextColor(stat.soloq_tier)}`}>
                    {stat.soloq_tier ? `${stat.soloq_tier} ${stat.soloq_rank}` : 'UNRANKED'}
                  </p>
                  {stat.soloq_tier && (
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300 mt-0.5">
                      {stat.soloq_lp} LP
                    </p>
                  )}
                </div>
              )}

              {/* Overall Stats */}
              <div className={`grid ${mode === 'team' ? 'grid-cols-3' : 'grid-cols-2'} gap-1 mb-4 border-t border-b border-slate-200 dark:border-[#322814] py-3`}>
                <div className="text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">Winrate</p>
                  <p className={`text-lg font-bold ${getColorWR(stat.winrate)}`}>
                    {stat.totalGames > 0 ? `${stat.winrate}%` : '-'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">KDA</p>
                  <p className={`text-lg font-bold ${getColorKDA(stat.overallKda)}`}>
                    {stat.totalGames > 0 ? stat.overallKda.toFixed(2) : '-'}
                  </p>
                </div>
                {mode === 'team' && (
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">Avg Score</p>
                    <p className={`text-lg font-bold ${stat.avgScore > 0 ? getColorAvgScore(stat.avgScore) : 'text-slate-400'}`}>
                      {stat.avgScore > 0 ? Math.round(stat.avgScore) : '-'}
                    </p>
                  </div>
                )}
              </div>

              {/* MVP Stats */}
              {mode === 'team' && (
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="text-center bg-emerald-50 dark:bg-[#0f1f1a] border border-emerald-100 dark:border-emerald-900/50 py-2">
                    <p className="text-[9px] text-emerald-600 dark:text-emerald-500 uppercase font-bold">MVPs</p>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{stat.mvpCount}</p>
                  </div>
                  <div className="text-center bg-rose-50 dark:bg-[#1f1216] border border-rose-100 dark:border-rose-900/50 py-2">
                    <p className="text-[9px] text-rose-600 dark:text-rose-500 uppercase font-bold">INTs</p>
                    <p className="text-lg font-bold text-rose-600 dark:text-rose-400">{stat.intMvpCount}</p>
                  </div>
                </div>
              )}

              {/* Top Champions */}
              <div className="flex flex-col flex-1">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold mb-2 text-center">
                  Top Picks
                </p>

                {stat.topChampions.length > 0 ? (
                  <div className="space-y-2">
                    {stat.topChampions.map((champ: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 bg-slate-50 dark:bg-[#1e2328] p-2 border border-slate-200 dark:border-[#322814]"
                      >
                        <Image
                          src={getChampionIcon(champ.name) || '/placeholder-icon.png'}
                          alt={champ.name}
                          width={28}
                          height={28}
                          className="w-7 h-7 border border-slate-300 dark:border-slate-600"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate leading-none mb-1">
                            {champ.name}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-none">
                            {champ.games} G •
                            <span className={`font-bold ml-1 ${getColorWR(champ.winrate)}`}>
                              {champ.winrate.toFixed(0)}%
                            </span> •
                            <span className={`font-bold ml-1 ${getColorKDA(champ.kda)}`}>
                              {champ.kda.toFixed(2)} KDA
                            </span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-4">
                    No games yet
                  </p>
                )}
              </div>
            </div>
          </div>
        )) : (
          <p className="col-span-5 text-center text-zinc-500 dark:text-zinc-400 py-10">No players added yet.</p>
        )}
      </div>
    </div>
  );
}
