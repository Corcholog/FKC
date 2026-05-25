// app/page.tsx
import { createClient } from '@/lib/supabase/server'
import Image from 'next/image'
import Link from 'next/link'
import Navbar from '@/app/components/Navbar'
import DurationChart from '@/app/components/DurationChart'
import SidePerformanceChart from '@/app/components/SidePerformanceChart'
import RoleDistributionChart from '@/app/components/RoleDistributionChart'
import MatchCard from '@/app/components/MatchCard'
import PlayerLinks from '@/app/components/PlayerLinks'
import RosterSection from '@/app/components/RosterSection'
import { allChampions } from '@/lib/champions'

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

const getColorAvgScore = (score: number) => {
  if (score >= 60) return 'text-blue-500'
  if (score >= 40) return 'text-green-500'
  if (score >= 25) return 'text-yellow-500'
  if (score >= 25) return 'text-yellow-500'
  return 'text-rose-500'
}

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
    .select(`
      id,
      we_won,
      match_type,
      duration_minutes,
      duration_seconds,
      our_side,
      ally_participants (
        role,
        kills,
        deaths,
        assists,
        damage_dealt,
        gold_earned,
        cs
      )
    `)
  const allMatches = allMatchesData || []

  // Fetch pre-calculated roster stats
  const { data: rosterCacheData } = await supabase
    .from('roster_stats_cache')
    .select('*')
  const rosterStatsCache = rosterCacheData || []

  // Fetch raw performance data for dynamic client-side filtering (e.g. Last 20 Games)
  const { data: teamPerformancesData } = await supabase
    .from('ally_participants')
    .select(`
      id,
      player_id,
      match_id,
      champion,
      kills,
      deaths,
      assists,
      score,
      matches!inner (id, date, we_won)
    `)
  const teamPerformances = teamPerformancesData || []

  const { data: soloqPerformancesData } = await supabase.from('soloq_matches').select('*')
  const soloqPerformances = soloqPerformancesData || []

  // If cache is empty or contains incomplete rows (missing picks or MVP counts), compute roster stats on the server
  let rosterStatsComputed = rosterStatsCache
  const cacheMissingData = !rosterStatsCache || rosterStatsCache.length === 0 || rosterStatsCache.some((r: any) => {
    return !r || !r.topChampions || !Array.isArray(r.topChampions) || r.topChampions.length === 0 || r.mvpCount === undefined || r.intMvpCount === undefined
  })

  if (cacheMissingData && (playerList && playerList.length > 0)) {
    const ROLE_ORDER = ['top', 'jungle', 'mid', 'adc', 'support']

    const playerMvpIntCounts: Record<number, { mvpCount: number; intMvpCount: number }> = {}
    const matchGroups: Record<number, any[]> = {}
    ;(teamPerformances || []).forEach((row: any) => {
      const matchId = row.matches?.id
      if (matchId) {
        if (!matchGroups[matchId]) matchGroups[matchId] = []
        matchGroups[matchId].push(row)
      }
    })

    Object.values(matchGroups).forEach((playersInMatch: any[]) => {
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

    const stats = (playerList || []).map((player: any) => {
      const tMatches = (teamPerformances || []).filter((p: any) => p.player_id === player.id)
      const sMatches = (soloqPerformances || []).filter((p: any) => p.player_id === player.id)

      let wins = 0
      let kills = 0
      let deaths = 0
      let assists = 0
      let totalScore = 0
      const mvpCount = playerMvpIntCounts[player.id]?.mvpCount || 0
      const intMvpCount = playerMvpIntCounts[player.id]?.intMvpCount || 0
      const champStats: Record<string, { games: number, wins: number, kills: number, deaths: number, assists: number }> = {}

      let gamesWithScore = 0
      let totalGames = 0

      const processMatch = (champion: string, win: boolean, k: number, d: number, a: number, score?: number) => {
        totalGames++
        if (win) wins++
        kills += k || 0
        deaths += d || 0
        assists += a || 0

        if (typeof score === 'number' && score > 0) {
          totalScore += score
          gamesWithScore++
        }

        if (!champStats[champion]) champStats[champion] = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 }
        champStats[champion].games++
        if (win) champStats[champion].wins++
        champStats[champion].kills += k || 0
        champStats[champion].deaths += d || 0
        champStats[champion].assists += a || 0
      }

      tMatches.forEach((row: any) => {
        processMatch(row.champion, row.matches?.we_won, row.kills, row.deaths, row.assists, row.score)
      })

      sMatches.forEach((row: any) => {
        processMatch(row.champion, row.win, row.kills, row.deaths, row.assists)
      })

      const winrate = totalGames > 0 ? (wins / totalGames) * 100 : 0
      const overallKda = deaths === 0 ? (kills + assists) : (kills + assists) / deaths
      const avgScore = gamesWithScore > 0 ? totalScore / gamesWithScore : 0

      const topChampions = Object.entries(champStats)
        .map(([name, champData]) => {
          const champWinrate = (champData.wins / champData.games) * 100
          const champKda = champData.deaths === 0 ? (champData.kills + champData.assists) : (champData.kills + champData.assists) / champData.deaths
          return {
            name,
            games: champData.games,
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
    })

    stats.sort((a, b) => ROLE_ORDER.indexOf(a.role.toLowerCase()) - ROLE_ORDER.indexOf(b.role.toLowerCase()))
    rosterStatsComputed = stats
  }



    // Normalize scrim type names for display
  const normalizeMatchType = (type: string) => {
  if (type === 'scrim_bo1' || type === 'scrim_bo3') return 'scrim';
  return type;
};

  const calculateWinrate = (matchType?: string | string[], isExclude: boolean = false): string => {
    if (!allMatches.length) return '0%'

    let filtered = allMatches.map((m: any) => ({
      ...m,
      normalized_type: normalizeMatchType(m.match_type)
    }))

    if (matchType) {
      if (Array.isArray(matchType)) {
        filtered = isExclude
          ? filtered.filter((m: any) => !matchType.includes(m.normalized_type))
          : filtered.filter((m: any) => matchType.includes(m.normalized_type))
      } else {
        filtered = filtered.filter((m: any) => m.normalized_type === matchType)
      }
    }

    if (!filtered.length) return '0%'
    const wins = filtered.filter((m: any) => m.we_won).length
    return `${Math.round((wins / filtered.length) * 100)}%`
  }

  const uniqueMatchTypes = Array.from(
  new Set(allMatches.map((m: any) => normalizeMatchType(m.match_type)))
).filter(Boolean) as string[]
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
    <main className="min-h-screen bg-background text-foreground pb-20 pt-16">

      {/* Navigation Bar */}
      <Navbar />

      {/* Hero Banner Row */}
      <div className="flex flex-col w-full border-b border-blue-200 dark:border-[#322814]">

        {/* Hero Banner (100%) */}
        <div className="relative w-full h-[500px] xl:h-[600px] flex items-center justify-center overflow-hidden bg-gradient-to-b from-[#74b9ff]/80 to-[#f4faff] dark:from-[#010a13]/80 dark:to-[#091428]">
          <Image src="/hero_banner.jpeg" alt="Hero Banner" fill className="object-cover opacity-[0.55] mix-blend-multiply" priority />
          <div className="relative text-center z-10 px-6 mt-10 flex flex-col items-center">
            <Image
              src="/icons/fkc_icon.jpg"
              alt="FKC Logo"
              width={120} height={120}
              className="w-32 h-32 mb-6 rounded-3xl border-2 border-white/80 shadow-[0_8px_30px_rgba(0,0,0,0.12)] object-cover hover:scale-105 transition duration-500"
            />
            <h1 className="text-5xl md:text-7xl font-black tracking-wider text-foreground drop-shadow-sm mb-6 md:mb-10 mt-4">FAKE CLAN</h1>
            <p className="text-xl md:text-2xl font-bold text-slate-600 dark:text-slate-300 bg-white/50 dark:bg-white/5 backdrop-blur-sm px-6 py-2 rounded-full border border-white/60 dark:border-white/10 shadow-sm">"Que ganas de mejorar la puta madre" - Joshy</p>
          </div>
        </div>
      </div>

      {/* Roster with Cached Stats */}
      <RosterSection
        playerList={playerList}
        rosterStatsCache={rosterStatsCache}
        teamPerformances={teamPerformances}
        soloqPerformances={soloqPerformances}
      />

      {/* Team Performance */}
      <div className="bg-blue-50 dark:bg-black py-16 border-y border-[#bae6fd] dark:border-[#322814] shadow-inner relative z-20">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-black mb-10 text-center text-foreground drop-shadow-sm">Team Performance</h2>
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap justify-center gap-8 text-center">
              {standardMatchTypes.map(type => (
                <div key={type} className="relative w-full sm:w-48 bg-gradient-to-b from-card to-blue-50/50 dark:to-[#0a101e] p-8 border border-blue-200/50 dark:border-[#1e2328] shadow-lg flex flex-col justify-center transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] dark:hover:shadow-[0_0_20px_rgba(59,130,246,0.1)] hover:border-blue-300 dark:hover:border-blue-800 group overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-blue-400 dark:via-blue-500 to-transparent opacity-30 group-hover:opacity-100 transition-opacity"></div>
                  <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-blue-300 dark:border-blue-700 opacity-50 group-hover:opacity-100 group-hover:border-blue-400 dark:group-hover:border-blue-500 transition-all"></div>
                  <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-blue-300 dark:border-blue-700 opacity-50 group-hover:opacity-100 group-hover:border-blue-400 dark:group-hover:border-blue-500 transition-all"></div>
                  <div className="absolute -right-4 -top-4 w-16 h-16 bg-blue-400/5 dark:bg-blue-600/5 rounded-full blur-xl group-hover:bg-blue-400/10 dark:group-hover:bg-blue-600/10 transition-colors"></div>
                  <div className="text-5xl font-black text-blue-600 dark:text-blue-400 drop-shadow-md relative z-10 group-hover:scale-105 transition-transform duration-300">{calculateWinrate(type)}</div>
                  <div className="mt-3 text-slate-500 dark:text-slate-400 font-bold text-xs tracking-widest uppercase relative z-10 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors">{type.replace(/_/g, ' ')}</div>
                </div>
              ))}
              {/* Overall WR Box (Estilo Dorado/Destacado) */}
              <div className="relative w-full sm:w-48 bg-gradient-to-b from-card to-yellow-50 dark:to-[#1a150b] p-8 border-2 border-[#f1c40f] dark:border-[#c8aa6e] shadow-[0_0_15px_rgba(241,196,15,0.15)] dark:shadow-[0_0_15px_rgba(200,170,110,0.1)] flex flex-col justify-center transition-all hover:-translate-y-1">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#f1c40f] dark:via-[#c8aa6e] to-transparent"></div>
                <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-[#f1c40f] dark:border-[#c8aa6e]"></div>
                <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-[#f1c40f] dark:border-[#c8aa6e]"></div>
                <div className="text-5xl font-black text-[#f39c12] dark:text-[#f0e6d2] drop-shadow-md">{calculateWinrate()}</div>
                <div className="mt-3 text-[#f39c12] dark:text-[#c8aa6e] font-black tracking-widest text-xs uppercase">OVERALL WR</div>
              </div>
            </div>

{competitiveMatchTypes.length > 0 && (
                <div className="flex flex-wrap justify-center gap-8 text-center pt-4">
                  {/* Competitive WR Box (Estilo Púrpura) */}
                  <div className="relative w-full sm:w-48 bg-gradient-to-b from-card to-purple-50 dark:to-[#160f24] p-8 border-2 border-purple-400 dark:border-purple-800 shadow-[0_0_15px_rgba(168,85,247,0.15)] dark:shadow-[0_0_15px_rgba(168,85,247,0.1)] flex flex-col justify-center transition-all hover:-translate-y-1">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-400 dark:via-purple-600 to-transparent"></div>
                    <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-purple-400 dark:border-purple-600"></div>
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-purple-400 dark:border-purple-600"></div>
                    <div className="text-5xl font-black text-purple-600 dark:text-purple-400 drop-shadow-md">{calculateWinrate(excludeTypes, true)}</div>
                    <div className="mt-3 text-purple-600 dark:text-purple-400 font-black tracking-widest text-xs uppercase">COMPETITIVE WR</div>
                  </div>
                  {(() => {
                    // Normalize scrim types to show as just "scrim"
                    const otherTypes = competitiveMatchTypes.filter(t => !t.includes('scrim'));
                    
                    return (
                      <>
                        {otherTypes.map(type => (
                          <div key={type} className="relative w-full sm:w-48 bg-gradient-to-b from-card to-blue-50/50 dark:to-[#0a102e] p-8 border border-blue-200/50 dark:border-[#1e2328] shadow-lg flex flex-col justify-center transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(59,130,246,0.1)] dark:hover:shadow-[0_0_20px_rgba(59,130,246,0.1)] hover:border-blue-300 dark:hover:border-blue-800 group overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-400 dark:via-blue-600 to-transparent"></div>
                            <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-blue-400 dark:border-blue-600"></div>
                            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-blue-400 dark:border-blue-600"></div>
                            <div className="text-5xl font-black text-blue-600 dark:text-blue-400 drop-shadow-md group-hover:scale-105 transition-transform duration-300">{calculateWinrate(type)}</div>
                            <div className="mt-3 text-blue-600 dark:text-blue-400 font-black tracking-widest text-xs uppercase">{normalizeMatchType(type)}</div>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              )}

            {/* Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 mt-2 max-w-5xl mx-auto w-full justify-items-center animate-fade-in">
              <SidePerformanceChart matches={allMatches} />
              <RoleDistributionChart matches={allMatches} />
              <DurationChart title="Overall WR by Duration" matches={allMatches} />
              <DurationChart title="Competitive WR by Duration" matches={competitiveMatches} />
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
          {recentMatches.length > 0 ? recentMatches.map((match: any) => (
            <MatchCard key={match.id} match={match} />
          )) : (
            <div className="bg-card border border-blue-100 dark:border-[#322814] rounded-2xl p-12 text-center shadow-sm">
              <p className="text-slate-500 dark:text-slate-400 text-lg mb-4">No matches recorded yet.</p>
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