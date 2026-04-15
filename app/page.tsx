// app/page.tsx
import { createClient } from '@/lib/supabase/server'
import Image from 'next/image'
import Link from 'next/link'

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
    .select('id, we_won, match_type')
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
    const cleanName = name.trim()
    if (!allChampions.includes(cleanName)) return null
    const key = cleanName.replace(/[^a-zA-Z0-9]/g, '')
    return `https://ddragon.leagueoflegends.com/cdn/16.7.1/img/champion/${key}.png`
  }

  const calculateWinrate = (matchType?: string): string => {
    if (!allMatches.length) return '0%'
    const filtered = matchType 
      ? allMatches.filter((m: any) => m.match_type === matchType)
      : allMatches
    if (!filtered.length) return '0%'
    const wins = filtered.filter((m: any) => m.we_won).length
    return `${Math.round((wins / filtered.length) * 100)}%`
  }

  const getPicksByRole = (participants: any[] = []) => {
    return participants.reduce((acc: any, p: any) => {
      if (p.role) acc[p.role.toLowerCase()] = p.champion
      return acc
    }, {})
  }

  const formatDuration = (minutes: number = 0, seconds: number = 0): string => {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white pb-20 pt-16">
      
      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800 z-50 flex items-center">
        <div className="max-w-7xl w-full mx-auto px-6 flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold text-yellow-400 tracking-wider">
            FAKE CLAN
          </Link>
          <div className="flex gap-8">
            <Link href="/" className="text-sm font-semibold hover:text-yellow-400 transition">Home</Link>
            <Link href="/stats" className="text-sm font-semibold hover:text-yellow-400 transition">Player Stats</Link>
            <Link href="/admin" className="text-sm font-semibold hover:text-yellow-400 transition">Admin Panel</Link>
          </div>
        </div>
      </nav>

      {/* Hero Banner */}
      <div className="relative h-[700px] flex items-center justify-center overflow-hidden bg-gradient-to-b from-zinc-900 to-black">
        <Image src="/hero_banner.jpeg" alt="Hero Banner" fill className="object-cover opacity-30" priority />
        <div className="relative text-center z-10 px-6 mt-10">
          <h1 className="text-7xl font-bold tracking-wider text-yellow-400 mb-4">FAKE CLAN</h1>
          <p className="text-2xl text-zinc-400">"Que ganas de mejorar la puta madre" - Joshy</p>
          <div className="mt-10 mx-auto w-full max-w-4xl">
            <Image src="/player_roster.jpeg" alt="Team Roster" width={800} height={320} className="w-full h-80 object-cover rounded-xl border border-zinc-700 shadow-2xl" />
          </div>
        </div>
      </div>

      {/* Roster with Integrated Stats */}
      <div className="max-w-7xl mx-auto px-6 py-16">
        <h2 className="text-4xl font-bold mb-10 text-center">Our Roster</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {rosterStats.length > 0 ? rosterStats.map((stat: any) => (
            <div key={stat.id} className="relative h-[720px] bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden hover:border-yellow-400 transition group flex flex-col justify-end">
              
              {/* Background Image: Loads from public/players/name.jpg */}
              <div className="absolute inset-0 z-0 bg-zinc-800 overflow-hidden">
                <img
                  src={`/players/${stat.name.toLowerCase().replace(/\s+/g, '')}.jpg`}
                  alt=""
                  className="w-full h-full object-cover object-top opacity-80 group-hover:scale-105 transition duration-500 text-transparent"
                />
                {/* Softer, lower gradient so the text is readable but the image shines through */}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/75 via-50% to-transparent"></div>
              </div>

              {/* Card Content Overlay */}
              <div className="relative z-10 p-5 flex flex-col h-full justify-end">
                <div className="text-center mb-4">
                  <div className="text-yellow-400 font-bold text-xs tracking-widest uppercase">{stat.role}</div>
                  <div className="text-3xl font-black mt-1 text-white uppercase tracking-wider">{stat.name}</div>
                </div>

                {/* Overall Stats */}
                <div className="grid grid-cols-2 gap-2 mb-4 border-t border-b border-zinc-700/50 py-3">
                  <div className="text-center">
                    <p className="text-[10px] text-zinc-500 uppercase font-bold">Winrate</p>
                    <p className={`text-xl font-bold ${getColorWR(stat.winrate)}`}>
                      {stat.totalGames > 0 ? `${stat.winrate}%` : '-'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-zinc-500 uppercase font-bold">KDA</p>
                    <p className={`text-xl font-bold ${getColorKDA(stat.overallKda)}`}>
                      {stat.totalGames > 0 ? stat.overallKda.toFixed(2) : '-'}
                    </p>
                  </div>
                </div>

                {/* Top 5 Champions */}
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase font-bold mb-2 text-center">Top Picks</p>
                  {stat.topChampions.length > 0 ? (
                    <div className="space-y-2">
                      {stat.topChampions.map((champ: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-3 bg-zinc-900/60 p-2 rounded-lg border border-zinc-700/50">
                          <img 
                            src={getChampionIcon(champ.name) || '/placeholder-icon.png'} 
                            alt={champ.name}
                            className="w-7 h-7 rounded border border-zinc-700"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-zinc-200 truncate leading-none mb-1">{champ.name}</p>
                            <p className="text-[10px] text-zinc-400 leading-none">
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
                    <p className="text-xs text-zinc-500 text-center py-4">No games yet</p>
                  )}
                </div>
              </div>
            </div>
          )) : (
            <p className="col-span-5 text-center text-zinc-500 py-10">No players added yet in Supabase.</p>
          )}
        </div>
      </div>

      {/* Team Performance */}
      <div className="bg-zinc-900 py-16 border-t border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-bold mb-10 text-center">Team Performance</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-center">
            <div className="bg-zinc-950 p-8 rounded-2xl border border-zinc-700 shadow-lg">
              <div className="text-5xl font-bold text-green-400">{calculateWinrate('flex')}</div>
              <div className="mt-2 text-zinc-400 font-medium">Flex Winrate</div>
            </div>
            <div className="bg-zinc-950 p-8 rounded-2xl border border-zinc-700 shadow-lg">
              <div className="text-5xl font-bold text-green-400">{calculateWinrate('scrim_bo1')}</div>
              <div className="mt-2 text-zinc-400 font-medium">Scrim BO1</div>
            </div>
            <div className="bg-zinc-950 p-8 rounded-2xl border border-zinc-700 shadow-lg">
              <div className="text-5xl font-bold text-green-400">{calculateWinrate('scrim_bo3')}</div>
              <div className="mt-2 text-zinc-400 font-medium">Scrim BO3</div>
            </div>
            <div className="bg-zinc-950 p-8 rounded-2xl border border-zinc-700 shadow-lg">
              <div className="text-5xl font-bold text-green-400">{calculateWinrate('clash')}</div>
              <div className="mt-2 text-zinc-400 font-medium">Clash</div>
            </div>
            <div className="bg-zinc-950 p-8 rounded-2xl border border-zinc-700 shadow-lg ring-1 ring-yellow-400/30">
              <div className="text-5xl font-bold text-yellow-400">{calculateWinrate()}</div>
              <div className="mt-2 text-yellow-400/80 font-bold tracking-wide">OVERALL WR</div>
            </div>
          </div>
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
          {recentMatches.length > 0 ? recentMatches.map((match: any) => {
            const allyPicks = getPicksByRole(match.ally_participants)
            const enemyPicks = getPicksByRole(match.enemy_participants)

            const bans = match.match_bans?.[0] || {}
            const ourBans: string[] = Array.isArray(bans.our_bans) ? bans.our_bans : []
            const enemyBans: string[] = Array.isArray(bans.enemy_bans) ? bans.enemy_bans : []

            const isOurBlue = match.our_side === 'Blue'

            // --- THE FIX: We route the picks to the correct visual column ---
            const bluePicks = isOurBlue ? allyPicks : enemyPicks;
            const redPicks = isOurBlue ? enemyPicks : allyPicks;
            const blueBans = isOurBlue ? ourBans : enemyBans;
            const redBans = isOurBlue ? enemyBans : ourBans;

            return (
              <div
                key={match.id}
                className={`rounded-2xl border-2 overflow-hidden shadow-lg ${
                  match.we_won 
                    ? 'bg-gradient-to-r from-green-950/40 to-zinc-900 border-green-700/50 hover:border-green-500' 
                    : 'bg-gradient-to-r from-red-950/40 to-zinc-900 border-red-700/50 hover:border-red-500'
                } transition-colors`}
              >
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-8">
                    
                    {/* LEFT COLUMN: ALWAYS BLUE */}
                    <div>
                      <div className="text-sm font-bold text-blue-400 mb-3 tracking-wider">
                        BLUE {isOurBlue && '(US)'}
                      </div>

                      {/* Blue Picks */}
                      <div className="flex justify-center gap-3 mb-6">
                        {['top','jungle','mid','adc','support'].map(role => {
                          const champ = bluePicks[role] // Pulls from bluePicks
                          const icon = getChampionIcon(champ)
                          return icon ? (
                            <img key={role} src={icon} alt={champ} className="w-14 h-14 rounded-xl border border-blue-600/50 shadow-md object-cover" />
                          ) : (
                            <div key={role} className="w-14 h-14 rounded-xl border border-zinc-600 bg-zinc-800 flex items-center justify-center text-xs text-zinc-400">?</div>
                          )
                        })}
                      </div>

                      {/* Blue Bans */}
                      {blueBans.length > 0 && (
                        <div className="flex justify-center gap-2">
                          {blueBans.slice(0, 5).map((ban: string, i: number) => {
                            const icon = getChampionIcon(ban)
                            return icon ? (
                              <img key={i} src={icon} alt={ban} className="w-8 h-8 rounded-lg border border-zinc-600/50 object-cover grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition" />
                            ) : (
                              <div key={i} className="w-8 h-8 rounded-lg border border-zinc-600 bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-400">
                                {ban?.substring(0,2) || '?'}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* RIGHT COLUMN: ALWAYS RED */}
                    <div>
                      <div className="text-sm font-bold text-red-400 mb-3 tracking-wider">
                        RED {!isOurBlue && '(US)'}
                      </div>

                      {/* Red Picks */}
                      <div className="flex justify-center gap-3 mb-6">
                        {['top','jungle','mid','adc','support'].map(role => {
                          const champ = redPicks[role] // Pulls from redPicks
                          const icon = getChampionIcon(champ)
                          return icon ? (
                            <img key={role} src={icon} alt={champ} className="w-14 h-14 rounded-xl border border-red-600/50 shadow-md object-cover" />
                          ) : (
                            <div key={role} className="w-14 h-14 rounded-xl border border-zinc-600 bg-zinc-800 flex items-center justify-center text-xs text-zinc-400">?</div>
                          )
                        })}
                      </div>

                      {/* Red Bans */}
                      {redBans.length > 0 && (
                        <div className="flex justify-center gap-2">
                          {redBans.slice(0, 5).map((ban: string, i: number) => {
                            const icon = getChampionIcon(ban)
                            return icon ? (
                              <img key={i} src={icon} alt={ban} className="w-8 h-8 rounded-lg border border-zinc-600/50 object-cover grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition" />
                            ) : (
                              <div key={i} className="w-8 h-8 rounded-lg border border-zinc-600 bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-400">
                                {ban?.substring(0,2) || '?'}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-zinc-950/50 border-t border-zinc-800/50 px-6 py-4 flex justify-between items-center text-sm">
                  <div className="text-zinc-400 font-medium">
                    {new Date(match.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} 
                    <span className="mx-2 text-zinc-600">|</span> 
                    <span className="text-zinc-300">{match.match_type?.replace('_', ' ').toUpperCase()}</span>
                  </div>
                  <div className="font-mono text-zinc-400 bg-zinc-900 px-3 py-1 rounded-md border border-zinc-700">
                    {formatDuration(match.duration_minutes, match.duration_seconds || 0)}
                  </div>
                  <div className={`font-black tracking-widest text-lg ${match.we_won ? 'text-green-500' : 'text-red-500'}`}>
                    {match.we_won ? 'VICTORY' : 'DEFEAT'}
                  </div>
                </div>
              </div>
            )
          }) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
              <p className="text-zinc-400 text-lg mb-4">No matches recorded yet.</p>
              <Link href="/admin" className="inline-block px-6 py-3 bg-yellow-500 text-black font-bold rounded-lg hover:bg-yellow-400 transition">
                Import Matches
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}