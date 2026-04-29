import { createClient } from '@/lib/supabase/server'
import Image from 'next/image'
import Navbar from '@/app/components/Navbar'

export const dynamic = 'force-dynamic'
export const revalidate = 0


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
  const overrides: Record<string, string> = { "Bel'Veth": "Belveth", "Cho'Gath": "Chogath", "FiddleSticks": "Fiddlesticks", "Kai'Sa": "Kaisa", "Kha'Zix": "Khazix", "K'Sante": "KSante", "Rek'Sai": "RekSai", "Vel'Koz": "Velkoz", "Wukong": "MonkeyKing" }
  const key = overrides[match] ?? match.replace(/[^a-zA-Z0-9]/g, '')
  return `https://ddragon.leagueoflegends.com/cdn/16.7.1/img/champion/${key}.png`
}

const QUOTES = [
  "“The obstacle is the way.”",
  "“No man is free who is not master of himself.”",
  "“He who conquers himself is the mightiest warrior.”",
  "“Luck is what happens when preparation meets opportunity.”",
  "“Life before Death.\n Strength before Weakness.\n Journey before Destination.”",
  "“Climb or be forgotten.”",
  "Fall. Rise. Repeat.”",
  "“Dejá los lobitos”",
  "“Me parece que ya es quejarse por quejarse”",
  "“It's easy to believe in something when you win all the time...The losses are what define a man's faith.”",
  "“To lack feeling is to be dead, but to act on every feeling is to be a child.”",
  "“Accept the pain, but don't accept that you deserved it.”",
  "“I will take responsibility for what I have done. \n If I must fall, I will rise each time a better man.”",
  "“A man was defined not by his flaws, but by how he overcame them.”",
  "“Legends Never Die.“",
  "“Prove yourself and rise.”",
  "“Welcome to the climb.”"
]

export default async function SoloQPage() {
  const supabase = await createClient()
  const randomQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)]

  // Fetch players
  const { data: playersData } = await supabase.from('players').select('*')
  const playerList = playersData || []

  // Fetch all soloq matches
  const { data: allMatchesData } = await supabase.from('soloq_matches').select('*')
  const allPerformances = allMatchesData || []

  // Calculate stats for the Roster cards
  const rosterStats = playerList.map(player => {
    const playerMatches = allPerformances.filter(p => p.player_id === player.id)

    let wins = 0
    let kills = 0
    let deaths = 0
    let assists = 0
    let cs = 0
    const champStats: Record<string, { games: number, wins: number, kills: number, deaths: number, assists: number }> = {}

    playerMatches.forEach((row: any) => {
      if (row.win) wins++
      kills += row.kills || 0
      deaths += row.deaths || 0
      assists += row.assists || 0
      cs += row.cs || 0

      if (!champStats[row.champion]) {
        champStats[row.champion] = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 }
      }
      champStats[row.champion].games++
      if (row.win) champStats[row.champion].wins++
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

  return (
    <main className="min-h-screen bg-background text-foreground pb-20 pt-16">
      <Navbar />

      <div className="relative pt-20 pb-12 flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#74b9ff]/20 to-transparent dark:from-[#091428] dark:to-transparent border-b border-blue-100 dark:border-[#322814] px-6">
        <div className="max-w-4xl mx-auto text-center relative py-2">
          <h1 className="whitespace-pre-line text-xl md:text-2xl lg:text-3xl font-black tracking-wide text-foreground drop-shadow-lg italic leading-relaxed">
            {randomQuote}
          </h1>
          <div className="w-16 h-1 bg-yellow-500 mx-auto mt-6 rounded-full opacity-80 shadow-[0_0_15px_rgba(234,179,8,0.6)]"></div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {rosterStats.length > 0 ? rosterStats.map((stat: any) => (
            <div
              key={stat.id}
              className={`bg-card border-2 rounded-2xl overflow-hidden transition flex flex-col ${getTierBorderColor(stat.soloq_tier)} hover:scale-[1.02] duration-300`}
            >
              {/* IMAGE TOP */}
              <div className="h-[280px] relative overflow-hidden">
                <img
                  src={`/players/${stat.name.toLowerCase().replace(/\s+/g, '')}.jpg`}
                  alt=""
                  className="w-full h-full object-cover object-top"
                />
                <div className="absolute bottom-0 w-full bg-gradient-to-t from-black/80 to-transparent pt-12 pb-3 px-4">
                  <div className="text-yellow-400 font-bold text-[10px] tracking-widest uppercase mb-0.5">
                    {stat.role}
                  </div>
                  <div className="text-2xl font-black text-white uppercase tracking-wider leading-none">
                    {stat.name}
                  </div>
                </div>
              </div>

              {/* CONTENT */}
              <div className="p-4 flex flex-col flex-1">

                {/* ELO Display */}
                <div className="text-center mb-5 pb-4 border-b border-slate-200 dark:border-[#322814]">
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

                {/* Overall Stats */}
                <div className="grid grid-cols-2 gap-2 mb-5">
                  <div className="text-center bg-slate-50 dark:bg-[#1e2328] rounded-xl py-3 border border-slate-100 dark:border-[#322814]">
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold mb-1">Winrate</p>
                    <p className={`text-lg font-black ${getColorWR(stat.winrate)}`}>
                      {stat.totalGames > 0 ? `${stat.winrate}%` : '-'}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium mt-1">
                      {stat.wins}W {stat.losses}L
                    </p>
                  </div>
                  <div className="text-center bg-slate-50 dark:bg-[#1e2328] rounded-xl py-3 border border-slate-100 dark:border-[#322814]">
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold mb-1">KDA</p>
                    <p className={`text-lg font-black ${getColorKDA(stat.overallKda)}`}>
                      {stat.totalGames > 0 ? stat.overallKda.toFixed(2) : '-'}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium mt-1">
                      {stat.totalGames} Games
                    </p>
                  </div>
                </div>

                {/* Top Champions */}
                <div className="flex flex-col flex-1">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold mb-3 text-center tracking-wider">
                    Most Played (SoloQ)
                  </p>

                  {stat.topChampions.length > 0 ? (
                    <div className="space-y-2.5 overflow-y-auto max-h-[250px] pr-1 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
                      {stat.topChampions.map((champ: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center gap-3 bg-white dark:bg-[#151a20] p-2.5 rounded-xl border border-slate-200 dark:border-[#322814]"
                        >
                          <Image
                            src={getChampionIcon(champ.name) || '/placeholder-icon.png'}
                            alt={champ.name}
                            width={32}
                            height={32}
                            className="w-8 h-8 rounded-lg border border-slate-300 dark:border-slate-700"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-foreground truncate leading-none mb-1.5">
                              {champ.name}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] leading-none">
                              <span className="text-slate-500 dark:text-slate-400 font-medium">{champ.games}G</span>
                              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                              <span className={`font-bold ${getColorWR(champ.winrate)}`}>
                                {champ.winrate.toFixed(0)}%
                              </span>
                              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                              <span className={`font-bold ${getColorKDA(champ.kda)}`}>
                                {champ.kda.toFixed(2)} KDA
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center py-6 border-2 border-dashed border-slate-200 dark:border-[#322814] rounded-xl">
                      <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        No Data
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )) : (
            <p className="col-span-5 text-center text-zinc-500 dark:text-zinc-400 py-10 font-bold">No players found.</p>
          )}
        </div>
      </div>
    </main>
  )
}
