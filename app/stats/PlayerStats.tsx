'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

// Types
type Player = {
  id: number
  name: string
  ign: string
  role: string
}

type ChampionStat = {
  championName: string
  games: number
  wins: number
  losses: number
  winrate: number
  kills: number
  deaths: number
  assists: number
  kda: number
  csPerMin: number
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

const getColorCS = (cs: number, role: string) => {
  if (role === 'Support') return 'text-zinc-400' // Neutral color for supports
  if (cs >= 8.0) return 'text-blue-400'
  if (cs >= 6.0) return 'text-green-400'
  return 'text-red-400'
}

// Reusing your icon helper
const getChampionIcon = (champion: string): string | undefined => {
  if (!champion?.trim()) return undefined
  const overrides: Record<string, string> = { "Bel'Veth":"Belveth","Cho'Gath":"Chogath","Kai'Sa":"Kaisa","Kha'Zix":"Khazix","K'Sante":"KSante","Rek'Sai":"RekSai","Vel'Koz":"Velkoz" }
  const trimmed = champion.trim()
  const key = overrides[trimmed] ?? trimmed.replace(/[^a-zA-Z0-9]/g, '')
  return `https://ddragon.leagueoflegends.com/cdn/14.7.1/img/champion/${key}.png`
}
export default function PlayerStats({ players }: { players: Player[] }) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<number>(players[0]?.id || 0)
  const [stats, setStats] = useState<ChampionStat[]>([])
  const [loading, setLoading] = useState(false)

  // Grab the active player to check their role
  const activePlayer = players.find(p => p.id === selectedPlayerId)
  const activeRole = activePlayer?.role || 'Unknown'

  useEffect(() => {
    if (!selectedPlayerId) return
    
    const fetchPlayerStats = async () => {
      setLoading(true)
      const supabase = createClient()

      // Fetch all performances for this player, joining the match data
      const { data, error } = await supabase
        .from('ally_participants')
        .select(`
          champion,
          kills,
          deaths,
          assists,
          cs,
          matches!inner (
            we_won,
            duration_minutes,
            duration_seconds
          )
        `)
        .eq('player_id', selectedPlayerId)

      if (error) {
        console.error("Error fetching stats:", error)
        setLoading(false)
        return
      }

      // Aggregate the raw data into champion stats
      const aggregated: Record<string, any> = {}

      data.forEach((row: any) => {
        const champ = row.champion
        const match = row.matches

        if (!aggregated[champ]) {
          aggregated[champ] = {
            championName: champ,
            games: 0, wins: 0, losses: 0,
            kills: 0, deaths: 0, assists: 0, cs: 0,
            totalMinutes: 0
          }
        }

        aggregated[champ].games += 1
        if (match.we_won) aggregated[champ].wins += 1
        else aggregated[champ].losses += 1

        aggregated[champ].kills += row.kills
        aggregated[champ].deaths += row.deaths
        aggregated[champ].assists += row.assists
        aggregated[champ].cs += row.cs
        
        // Calculate exact minutes (e.g., 30 mins 30 secs = 30.5 minutes)
        aggregated[champ].totalMinutes += match.duration_minutes + (match.duration_seconds / 60)
      })

      // Format the final array and calculate averages
      const finalStats: ChampionStat[] = Object.values(aggregated).map((stat: any) => {
        const kda = stat.deaths === 0 
          ? (stat.kills + stat.assists) // "Perfect" KDA
          : (stat.kills + stat.assists) / stat.deaths

        const csPerMin = stat.totalMinutes > 0 ? stat.cs / stat.totalMinutes : 0
        const winrate = (stat.wins / stat.games) * 100

        return {
          championName: stat.championName,
          games: stat.games,
          wins: stat.wins,
          losses: stat.losses,
          winrate: Number(winrate.toFixed(1)),
          kills: Number((stat.kills / stat.games).toFixed(1)),
          deaths: Number((stat.deaths / stat.games).toFixed(1)),
          assists: Number((stat.assists / stat.games).toFixed(1)),
          kda: Number(kda.toFixed(2)),
          csPerMin: Number(csPerMin.toFixed(1))
        }
      })

      // Sort by games played (descending), then by winrate
      finalStats.sort((a, b) => {
        if (b.games !== a.games) return b.games - a.games
        return b.winrate - a.winrate
      })

      setStats(finalStats)
      setLoading(false)
    }

    fetchPlayerStats()
  }, [selectedPlayerId])

  return (
    <div className="w-full max-w-6xl mx-auto px-8 py-8 bg-zinc-950 text-white">
      <div className="flex justify-between items-center mb-8 border-b border-zinc-800 pb-6">
        <h1 className="text-4xl font-bold text-yellow-400">Player Statistics</h1>
        
        {/* Player Selector Dropdown */}
        <div className="flex items-center gap-4">
          <label className="font-medium text-zinc-400">Select Player:</label>
          <select 
            value={selectedPlayerId} 
            onChange={(e) => setSelectedPlayerId(Number(e.target.value))}
            className="p-3 bg-zinc-800 border border-zinc-700 rounded-lg font-medium text-white min-w-[200px]"
          >
            {players.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.ign}) - {p.role}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-yellow-400 font-medium text-xl animate-pulse">
          Analyzing matches...
        </div>
      ) : stats.length === 0 ? (
        <div className="text-center py-20 text-zinc-500 text-lg">
          No matches found for this player. Import some data!
        </div>
      ) : (
        <div className="overflow-hidden bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-800 border-b border-zinc-700 text-zinc-300 text-sm uppercase tracking-wider">
                <th className="p-4 font-semibold">Champion</th>
                <th className="p-4 font-semibold text-center">Games</th>
                <th className="p-4 font-semibold text-center">W - L</th>
                <th className="p-4 font-semibold text-center">Winrate</th>
                <th className="p-4 font-semibold text-center">K / D / A</th>
                <th className="p-4 font-semibold text-center">KDA Ratio</th>
                <th className="p-4 font-semibold text-center">CS/Min</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {stats.map((stat, idx) => (
                <tr key={idx} className="hover:bg-zinc-800/50 transition-colors">
                  {/* Champion Name & Icon */}
                  <td className="p-4 flex items-center gap-3">
                    <Image 
                      src={getChampionIcon(stat.championName) || '/placeholder-icon.png'} 
                      alt={stat.championName}
                      width={40} height={40}
                      className="w-10 h-10 rounded-md shadow-sm border border-zinc-700"
                    />
                    <span className="font-medium text-lg">{stat.championName}</span>
                  </td>
                  
                  {/* Games Played */}
                  <td className="p-4 text-center font-bold text-lg text-yellow-400">
                    {stat.games}
                  </td>
                  
                  {/* Wins - Losses */}
                  <td className="p-4 text-center text-zinc-300">
                    <span className="text-green-400 font-semibold">{stat.wins}W</span>
                    <span className="mx-1 text-zinc-500">-</span>
                    <span className="text-red-400 font-semibold">{stat.losses}L</span>
                  </td>

                  {/* Winrate */}
                  <td className="p-4 text-center">
                    <span className={`font-bold text-lg ${getColorWR(stat.winrate)}`}>
                      {stat.winrate}%
                    </span>
                  </td>

                  {/* Average KDA (Kills / Deaths / Assists) */}
                  <td className="p-4 text-center text-zinc-300">
                    {stat.kills} / <span className="text-red-400">{stat.deaths}</span> / {stat.assists}
                  </td>

                  {/* KDA Ratio */}
                  <td className="p-4 text-center">
                    <span className={`font-bold ${getColorKDA(stat.kda)}`}>
                      {stat.kda}
                    </span>
                  </td>

                  {/* CS Per Minute */}
                  <td className="p-4 text-center">
                    <span className={`font-bold ${getColorCS(stat.csPerMin, activeRole)}`}>
                      {stat.csPerMin}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}