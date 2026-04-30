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
  if (role === 'Support') return 'text-slate-400'
  if (cs >= 8.0) return 'text-blue-400'
  if (cs >= 6.0) return 'text-green-400'
  return 'text-red-400'
}

const getChampionIcon = (champion: string): string | undefined => {
  if (!champion?.trim()) return undefined
  const overrides: Record<string, string> = { "Bel'Veth": "Belveth", "Cho'Gath": "Chogath", "FiddleSticks": "Fiddlesticks", "Kai'Sa": "Kaisa", "Kha'Zix": "Khazix", "K'Sante": "KSante", "Rek'Sai": "RekSai", "Vel'Koz": "Velkoz", "Wukong": "MonkeyKing", "LeBlanc": "Leblanc", "RenataGlasc": "Renata" }
  const trimmed = champion.trim()
  const key = overrides[trimmed] ?? trimmed.replace(/[^a-zA-Z0-9]/g, '')
  return `https://ddragon.leagueoflegends.com/cdn/16.7.1/img/champion/${key}.png`
}

// Limpiamos las props: ya no necesitamos onPlayerSelect
export default function PlayerStats({
  players,
  selectedPlayerId
}: {
  players: Player[],
  selectedPlayerId: number
}) {
  const [stats, setStats] = useState<ChampionStat[]>([])
  const [loading, setLoading] = useState(false)

  const activePlayer = players.find(p => p.id === selectedPlayerId)
  const activeRole = activePlayer?.role || 'Unknown'

  useEffect(() => {
    if (!selectedPlayerId) return

    const fetchPlayerStats = async () => {
      setLoading(true)
      const supabase = createClient()

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

        aggregated[champ].totalMinutes += match.duration_minutes + (match.duration_seconds / 60)
      })

      const finalStats: ChampionStat[] = Object.values(aggregated).map((stat: any) => {
        const kda = stat.deaths === 0
          ? (stat.kills + stat.assists)
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
    <div className="w-full max-w-6xl mx-auto px-8 py-8 text-foreground">

      <div className="mb-8 border-b border-slate-200 dark:border-[#322814] pb-6 flex flex-col items-center text-center">
        <h1 className="text-4xl font-black text-foreground drop-shadow-sm">
          Estadísticas de {activePlayer?.name || 'Jugador'}
        </h1>
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mt-2">
          Haz clic en las tarjetas de arriba para ver el historial de otro jugador
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-[#0984e3] font-bold text-xl animate-pulse">
          Analizando partidas...
        </div>
      ) : stats.length === 0 ? (
        <div className="text-center py-20 text-slate-500 font-medium text-lg">
          No hay partidas registradas para este jugador.
        </div>
      ) : (
        <div className="overflow-hidden bg-card border border-blue-100 dark:border-[#322814] rounded-none shadow-xl shadow-blue-900/5">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#091428] border-b border-slate-200 dark:border-[#322814] text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                <th className="p-4 font-black">Champion</th>
                <th className="p-4 font-black text-center">Games</th>
                <th className="p-4 font-black text-center">W - L</th>
                <th className="p-4 font-black text-center">Winrate</th>
                <th className="p-4 font-black text-center">K / D / A</th>
                <th className="p-4 font-black text-center">KDA Ratio</th>
                <th className="p-4 font-black text-center">CS/Min</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#322814]">
              {stats.map((stat, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-[#1e2328]/50 transition-colors">
                  <td className="p-4 flex items-center gap-3">
                    <Image
                      src={getChampionIcon(stat.championName) || '/placeholder-icon.png'}
                      alt={stat.championName}
                      width={40} height={40}
                      className="w-10 h-10 border border-slate-200 dark:border-slate-600 shadow-sm"
                    />
                    <span className="font-bold text-foreground">{stat.championName}</span>
                  </td>

                  <td className="p-4 text-center font-black text-lg text-yellow-600">
                    {stat.games}
                  </td>

                  <td className="p-4 text-center text-slate-500 dark:text-slate-400 font-semibold text-sm">
                    <span className="text-green-500">{stat.wins}W</span>
                    <span className="mx-1 text-slate-300">-</span>
                    <span className="text-red-500">{stat.losses}L</span>
                  </td>

                  <td className="p-4 text-center">
                    <span className={`font-black text-lg ${getColorWR(stat.winrate)}`}>
                      {stat.winrate}%
                    </span>
                  </td>

                  <td className="p-4 text-center text-slate-600 dark:text-slate-300 font-semibold text-sm">
                    {stat.kills} / <span className="text-red-400">{stat.deaths}</span> / {stat.assists}
                  </td>

                  <td className="p-4 text-center">
                    <span className={`font-black ${getColorKDA(stat.kda)}`}>
                      {stat.kda}
                    </span>
                  </td>

                  <td className="p-4 text-center">
                    <span className={`font-black ${getColorCS(stat.csPerMin, activeRole)}`}>
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