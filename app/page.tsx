// app/page.tsx
import { createClient } from '@/lib/supabase/server'
import Image from 'next/image'
import Link from 'next/link'
import Navbar from '@/app/components/Navbar'
import DurationChart from '@/app/components/DurationChart'
import MatchCard from '@/app/components/MatchCard'

type Player = {
  id: number
  name: string
  ign: string
  role: string
  puuid: string
}

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

const ROLE_ORDER = ['Top', 'Jungle', 'Mid', 'ADC', 'Support']


export default async function Home() {
  const supabase = await createClient()

  // Fetch players
  const { data: playersData } = await supabase
    .from('players')
    .select('*')

  const playerList = playersData || []

  // Fetch recent matches
  const { data: recentMatchesData } = await supabase
    .from('matches')
    .select(`
      *,
      ally_participants (*),
      enemy_participants (*),
      match_bans (*)
    `)
    .order('date', { ascending: false })
    .limit(6)
  const recentMatches = recentMatchesData || []

  // Fetch all matches for overall statistics
  const { data: allMatchesData } = await supabase
    .from('matches')
    .select('id, we_won, match_type, duration_minutes')
  const allMatches = allMatchesData || []

  // Fetch all player performances for the Roster Stats
  const { data: allPerformancesData } = await supabase
    .from('ally_participants')
    .select(`
      player_id,
      champion,
      kills,
      deaths,
      assists,
      matches!inner (we_won)
    `)
  const allPerformances = allPerformancesData || []

  // Calculate stats for the Roster cards
  const rosterStats = playerList.map(player => {
    const playerMatches = allPerformances.filter(p => p.player_id === player.id)

    let wins = 0
    let kills = 0
    let deaths = 0
    let assists = 0
    const champStats: Record<string, { games: number, wins: number, kills: number, deaths: number, assists: number }> = {}

    playerMatches.forEach((row: any) => {
      if (row.matches.we_won) wins++
      kills += row.kills || 0
      deaths += row.deaths || 0
      assists += row.assists || 0

      if (!champStats[row.champion]) {
        champStats[row.champion] = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 }
      }
      champStats[row.champion].games++
      if (row.matches.we_won) champStats[row.champion].wins++
      champStats[row.champion].kills += row.kills || 0
      champStats[row.champion].deaths += row.deaths || 0
      champStats[row.champion].assists += row.assists || 0
    })

    const totalGames = playerMatches.length
    const winrate = totalGames > 0 ? (wins / totalGames) * 100 : 0
    const overallKda = deaths === 0 ? (kills + assists) : (kills + assists) / deaths

    // Calculate individual KDA and slice top 5
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
      topChampions
    }
  })

  // Ensure strict role order mapping
  rosterStats.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))

  // Complete Champion List
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
    const overrides: Record<string, string> = { "Bel'Veth": "Belveth", "Cho'Gath": "Chogath", "Kai'Sa": "Kaisa", "Kha'Zix": "Khazix", "K'Sante": "KSante", "Rek'Sai": "RekSai", "Vel'Koz": "Velkoz", "Wukong": "MonkeyKing" }
    const key = overrides[match] ?? match.replace(/[^a-zA-Z0-9]/g, '')
    return `https://ddragon.leagueoflegends.com/cdn/16.7.1/img/champion/${key}.png`
  }

  const calculateWinrate = (matchType?: string | string[], isExclude: boolean = false): string => {
    if (!allMatches.length) return '0%'

    let filtered = allMatches;
    if (matchType) {
      if (Array.isArray(matchType)) {
        filtered = isExclude
          ? allMatches.filter((m: any) => !matchType.includes(m.match_type))
          : allMatches.filter((m: any) => matchType.includes(m.match_type))
      } else {
        filtered = allMatches.filter((m: any) => m.match_type === matchType)
      }
    }

    if (!filtered.length) return '0%'
    const wins = filtered.filter((m: any) => m.we_won).length
    return `${Math.round((wins / filtered.length) * 100)}%`
  }

  const uniqueMatchTypes = Array.from(new Set(allMatches.map((m: any) => m.match_type))).filter(Boolean) as string[]
  const desiredStandardOrder = ['flex', 'clash', 'scrim_bo1', 'scrim_bo3', 'scrim']
  const standardMatchTypes = desiredStandardOrder.filter(t => uniqueMatchTypes.includes(t))
  const competitiveMatchTypes = uniqueMatchTypes.filter(t => !desiredStandardOrder.includes(t))

  // Create an array specifically for competitive matches using the same filter logic as the WR box
  const excludeTypes = ['flex', 'scrim_bo1', 'scrim_bo3', 'scrim', 'clash'];
  const competitiveMatches = allMatches.filter((m: any) => !excludeTypes.includes(m.match_type));

  const getPicksByRole = (participants: any[] = []) => {
    return participants.reduce((acc: any, p: any) => {
      if (p.role) acc[p.role.toLowerCase()] = p
      return acc
    }, {})
  }

  const formatDuration = (minutes: number = 0, seconds: number = 0): string => {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  return (
    <main className="min-h-screen bg-[#f4faff] text-slate-900 pb-20 pt-16">

      {/* Navigation Bar */}
      <Navbar />

      {/* Hero Banner */}
      <div className="relative h-[700px] flex items-center justify-center overflow-hidden bg-gradient-to-b from-[#74b9ff]/80 to-[#f4faff]">
        <Image src="/hero_banner.jpeg" alt="Hero Banner" fill className="object-cover opacity-[0.15] mix-blend-multiply" priority />
        <div className="relative text-center z-10 px-6 mt-10 flex flex-col items-center">
          <Image
            src="/icons/fkc_icon.jpg"
            alt="FKC Logo"
            width={120} height={120}
            className="w-32 h-32 mb-6 rounded-3xl border-2 border-white/80 shadow-[0_8px_30px_rgba(0,0,0,0.12)] object-cover hover:scale-105 transition duration-500"
          />
          <h1 className="text-7xl font-black tracking-wider text-slate-900 drop-shadow-sm mb-4">FAKE CLAN</h1>
          <p className="text-2xl font-bold text-slate-600 bg-white/50 backdrop-blur-sm px-6 py-2 rounded-full border border-white/60 shadow-sm">"Que ganas de mejorar la puta madre" - Joshy</p>
          <div className="mt-10 mx-auto w-full max-w-4xl">
            <Image src="/player_roster.jpeg" alt="Team Roster" width={800} height={320} className="w-full h-80 object-cover rounded-xl border-4 border-white shadow-[0_20px_50px_rgba(8,112,184,0.15)] bg-white" />
          </div>
        </div>
      </div>

      {/* Roster with Integrated Stats */}
      <div className="max-w-7xl mx-auto px-6 py-16">
        <h2 className="text-4xl font-bold mb-10 text-center">Our Roster</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {rosterStats.length > 0 ? rosterStats.map((stat: any) => (
            <div key={stat.id} className="relative h-[720px] bg-white border border-zinc-200 rounded-2xl overflow-hidden hover:border-yellow-400 transition group flex flex-col justify-end">

              {/* Background Image Container */}
              <div className="absolute inset-0 z-0 bg-white overflow-hidden">
                <img
                  src={`/players/${stat.name.toLowerCase().replace(/\s+/g, '')}.jpg`}
                  alt=""
                  className="w-full h-full object-cover object-top opacity-100 group-hover:scale-105 transition duration-500 text-transparent"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-white from-50% to-transparent to-50%"></div>
              </div>

              {/* Card Content Overlay: */}
              <div className="relative z-10 p-5 flex flex-col h-1/2 bg-white">
                <div className="text-center mb-4">
                  <div className="text-yellow-600 font-bold text-xs tracking-widest uppercase">{stat.role}</div>
                  <div className="text-3xl font-black mt-1 text-slate-900 uppercase tracking-wider">{stat.name}</div>
                </div>

                {/* Overall Stats */}
                <div className="grid grid-cols-2 gap-2 mb-4 border-t border-b border-slate-200 py-3">
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Winrate</p>
                    <p className={`text-xl font-bold ${getColorWR(stat.winrate)}`}>
                      {stat.totalGames > 0 ? `${stat.winrate}%` : '-'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 uppercase font-bold">KDA</p>
                    <p className={`text-xl font-bold ${getColorKDA(stat.overallKda)}`}>
                      {stat.totalGames > 0 ? stat.overallKda.toFixed(2) : '-'}
                    </p>
                  </div>
                </div>

                {/* Top 5 Champions */}
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-2 text-center">Top Picks</p>
                  {stat.topChampions.length > 0 ? (
                    <div className="space-y-2">
                      {stat.topChampions.map((champ: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-200 mt-1">
                          <Image
                            src={getChampionIcon(champ.name) || '/placeholder-icon.png'}
                            alt={champ.name}
                            width={28} height={28}
                            className="w-7 h-7 rounded border border-slate-300"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate leading-none mb-1">{champ.name}</p>
                            <p className="text-[10px] text-slate-500 leading-none">
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
                    <p className="text-xs text-slate-400 text-center py-4">No games yet</p>
                  )}
                </div>
              </div>
            </div>
          )) : (
            <p className="col-span-5 text-center text-zinc-500 py-10">No players added yet.</p>
          )}
        </div>
      </div>

      {/* Recent Matches */}
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="flex justify-between items-center mb-10">
          <h2 className="text-4xl font-bold">Recent Matches</h2>
          <Link href="/stats" className="text-yellow-400 hover:text-yellow-300 font-medium transition flex items-center gap-2">
            View All Stats <span>→</span>
          </Link>
        </div>

        <div className="grid gap-6">
          {recentMatches.length > 0 ? recentMatches.map((match: any) => (
            <MatchCard key={match.id} match={match} allChampions={allChampions} />
          )) : (
            <div className="bg-white border border-blue-100 rounded-2xl p-12 text-center shadow-sm">
              <p className="text-slate-500 text-lg mb-4">No matches recorded yet.</p>
              <Link href="/admin" className="inline-block px-6 py-3 bg-[#f1c40f] text-slate-900 font-bold rounded-lg hover:bg-yellow-400 transition shadow-md">
                Import Matches
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}