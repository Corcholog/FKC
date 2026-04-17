'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

type Player = {
  id: number
  name: string
  ign: string
  role: string
}

type PlayerSummary = {
  player: Player
  totalGames: number
  wins: number
  losses: number
  winrate: number
  overallKda: number
  topChampions: { 
    name: string; 
    games: number; 
    winrate: number;
    kda: number;
  }[]
}

const getChampionIcon = (champion: string): string | undefined => {
  if (!champion?.trim()) return undefined
  const overrides: Record<string, string> = { "Bel'Veth":"Belveth","Cho'Gath":"Chogath","Kai'Sa":"Kaisa","Kha'Zix":"Khazix","K'Sante":"KSante","Rek'Sai":"RekSai","Vel'Koz":"Velkoz" }
  const trimmed = champion.trim()
  const key = overrides[trimmed] ?? trimmed.replace(/[^a-zA-Z0-9]/g, '')
  return `https://ddragon.leagueoflegends.com/cdn/14.7.1/img/champion/${key}.png`
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

export default function TeamOverview({ players }: { players: Player[] }) {
  const [teamStats, setTeamStats] = useState<PlayerSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTeamStats = async () => {
      setLoading(true)
      const supabase = createClient()

      const { data, error } = await supabase
        .from('ally_participants')
        .select(`
          player_id,
          champion,
          kills,
          deaths,
          assists,
          matches!inner (we_won)
        `)

      if (error || !data) {
        console.error("Error fetching stats:", error)
        setLoading(false)
        return
      }

      const summaries: PlayerSummary[] = players.map(player => {
        const playerMatches = data.filter((row: any) => row.player_id === player.id)
        
        let wins = 0
        let totalKills = 0
        let totalDeaths = 0
        let totalAssists = 0
        
        // We MUST initialize kills, deaths, and assists here to calculate the KDA later
        const champStats: Record<string, { games: number, wins: number, kills: number, deaths: number, assists: number }> = {}

        playerMatches.forEach((row: any) => {
          if (row.matches.we_won) wins++
          totalKills += row.kills || 0
          totalDeaths += row.deaths || 0
          totalAssists += row.assists || 0

          if (!champStats[row.champion]) {
            champStats[row.champion] = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 }
          }
          
          champStats[row.champion].games++
          if (row.matches.we_won) champStats[row.champion].wins++
          
          // Tally up the stats for this specific champion
          champStats[row.champion].kills += row.kills || 0
          champStats[row.champion].deaths += row.deaths || 0
          champStats[row.champion].assists += row.assists || 0
        })

        const totalGames = playerMatches.length
        const winrate = totalGames > 0 ? (wins / totalGames) * 100 : 0
        const overallKda = totalDeaths === 0 
          ? (totalKills + totalAssists) 
          : (totalKills + totalAssists) / totalDeaths

        // Calculate individual champion KDA and grab the top 5
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
          player,
          totalGames,
          wins,
          losses: totalGames - wins,
          winrate: Number(winrate.toFixed(1)),
          overallKda: Number(overallKda.toFixed(2)),
          topChampions
        }
      })

      summaries.sort((a, b) => ROLE_ORDER.indexOf(a.player.role) - ROLE_ORDER.indexOf(b.player.role))

      setTeamStats(summaries)
      setLoading(false)
    }

    if (players.length > 0) fetchTeamStats()
  }, [players])

  if (loading) {
    return <div className="py-20 text-center text-yellow-400 text-xl animate-pulse">Loading Team Data...</div>
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 py-8">
      <h2 className="text-3xl font-bold text-yellow-400 mb-8 px-4">Starting Roster</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {teamStats.map((stat, idx) => (
          <div key={idx} className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-xl flex flex-col">
            
            <div className="bg-zinc-800 p-4 border-b border-zinc-700 text-center">
              <span className="text-xs uppercase tracking-wider text-zinc-400 font-bold block mb-1">
                {stat.player.role}
              </span>
              <h3 className="text-xl font-bold text-white truncate" title={stat.player.ign}>
                {stat.player.ign}
              </h3>
              <p className="text-sm text-zinc-500">{stat.player.name}</p>
            </div>

            <div className="p-5 flex-1 border-b border-zinc-800">
              <div className="flex justify-between items-center mb-4">
                <div className="text-center">
                  <p className="text-xs text-zinc-500 uppercase">Winrate</p>
                  <p className={`text-xl font-bold ${getColorWR(stat.winrate)}`}>
                    {stat.totalGames > 0 ? `${stat.winrate}%` : '-'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-zinc-500 uppercase">KDA</p>
                  <p className={`text-xl font-bold ${getColorKDA(stat.overallKda)}`}>
                    {stat.totalGames > 0 ? stat.overallKda.toFixed(2) : '-'}
                  </p>
                </div>
              </div>
              <div className="text-center text-sm text-zinc-400 font-medium pb-2">
                {stat.wins}W - {stat.losses}L ({stat.totalGames} Games)
              </div>
            </div>

            <div className="p-4 bg-zinc-900/50">
              <p className="text-xs text-zinc-500 uppercase font-bold mb-3">Top 5 Champions</p>
              {stat.topChampions.length > 0 ? (
                <div className="space-y-2">
                  {stat.topChampions.map((champ, cIdx) => (
                    <div key={cIdx} className="flex items-center gap-3">
                      <Image 
                        src={getChampionIcon(champ.name) || '/placeholder-icon.png'} 
                        alt={champ.name}
                        width={32} height={32}
                        className="w-8 h-8 rounded border border-zinc-700"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-200 truncate">{champ.name}</p>
                        <p className="text-[11px] text-zinc-400">
                          {champ.games} games • 
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
                <div className="text-sm text-zinc-600 text-center py-4">No data yet</div>
              )}
            </div>

          </div>
        ))}
      </div>
    </div>
  )
}