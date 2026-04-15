'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/app/components/Navbar'

type Match = {
  id: number
  date: string
  match_type: string
  we_won: boolean
  duration_minutes: number
  duration_seconds: number
  our_side: 'Blue' | 'Red'
  enemy_team_name: string | null
  ally_participants: {
    id: number
    match_id: number
    player_id: number
    champion: string
    role: string
    kills: number
    deaths: number
    assists: number
    cs: number
  }[]
  enemy_participants: {
    id: number
    match_id: number
    champion: string
    role: string
    kills: number
    deaths: number
    assists: number
    cs: number
  }[]
  match_bans: {
    id: number
    match_id: number
    our_bans: string[]
    enemy_bans: string[]
  }[]
}

const MATCHES_PER_PAGE = 10

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([])
  const [totalMatches, setTotalMatches] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchMatches = async () => {
      setLoading(true)
      
      // Get total count
      const { count: totalCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })

      setTotalMatches(totalCount || 0)

      // Get paginated matches
      const offset = (currentPage - 1) * MATCHES_PER_PAGE
      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          ally_participants(*),
          enemy_participants(*),
          match_bans(*)
        `)
        .order('date', { ascending: false })
        .range(offset, offset + MATCHES_PER_PAGE - 1)

      if (!error && data) {
        setMatches(data as Match[])
      }
      setLoading(false)
    }

    fetchMatches()
  }, [currentPage])

  const totalPages = Math.ceil(totalMatches / MATCHES_PER_PAGE)

// Full champion list (April 2026)
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

  const getPicksByRole = (participants: any[] = []) => {
    return participants.reduce((acc: any, p: any) => {
      if (p.role) acc[p.role.toLowerCase()] = p.champion
      return acc
    }, {})
  }

  const formatDuration = (minutes: number = 0, seconds: number = 0): string => {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const getChampionIcon = (name: string): string | null => {
    if (!name?.trim()) return null
    const normalize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    const match = allChampions.find(c => normalize(c) === normalize(name))
    if (!match) return null
    const overrides: Record<string, string> = { "Bel'Veth":"Belveth","Cho'Gath":"Chogath","Kai'Sa":"Kaisa","Kha'Zix":"Khazix","K'Sante":"KSante","Rek'Sai":"RekSai","Vel'Koz":"Velkoz" }
    const key = overrides[match] ?? match.replace(/[^a-zA-Z0-9]/g, '')
    return `https://ddragon.leagueoflegends.com/cdn/16.7.1/img/champion/${key}.png`
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white pb-20 pt-16">
      
      {/* Navigation Bar */}
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 py-16">
        <h1 className="text-5xl font-bold mb-2 text-yellow-400">Match History</h1>
        <p className="text-zinc-400 mb-10">Total matches: {totalMatches}</p>

        {/* Matches List */}
        <div className="grid gap-6">
          {loading ? (
            <div className="text-center py-12 text-zinc-400">Loading matches...</div>
          ) : matches.length > 0 ? (
            matches.map((match) => {
              const allyPicks = getPicksByRole(match.ally_participants)
              const enemyPicks = getPicksByRole(match.enemy_participants)

              const bans = match.match_bans?.[0] || {}
              const ourBans: string[] = Array.isArray(bans.our_bans) ? bans.our_bans : []
              const enemyBans: string[] = Array.isArray(bans.enemy_bans) ? bans.enemy_bans : []

              const isOurBlue = match.our_side === 'Blue'

              // Route the picks to the correct visual column
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
                            const champ = bluePicks[role]
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
                            const champ = redPicks[role]
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

                    {/* Match Info Footer */}
                    <div className="border-t border-zinc-700 mt-6 pt-4 flex justify-between items-center text-sm">
                      <div className="text-zinc-400">
                        {new Date(match.date).toLocaleDateString()} • {match.match_type.replace('_', ' ').toUpperCase()}
                        {match.enemy_team_name && <span className="ml-2">vs {match.enemy_team_name}</span>}
                      </div>
                      <div className="text-zinc-400">
                        {formatDuration(match.duration_minutes, match.duration_seconds)}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-center py-12 text-zinc-400">No matches found</div>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-4">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-6 py-2 bg-yellow-400 hover:bg-yellow-500 disabled:bg-zinc-600 disabled:cursor-not-allowed text-black font-semibold rounded-lg transition"
            >
              ← Previous
            </button>

            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-10 h-10 rounded-lg font-semibold transition ${
                    currentPage === page
                      ? 'bg-yellow-400 text-black'
                      : 'bg-zinc-800 text-white hover:bg-zinc-700'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-6 py-2 bg-yellow-400 hover:bg-yellow-500 disabled:bg-zinc-600 disabled:cursor-not-allowed text-black font-semibold rounded-lg transition"
            >
              Next →
            </button>
          </div>
        )}

        {/* Page Info */}
        <div className="mt-8 text-center text-sm text-zinc-400">
          Page {currentPage} of {totalPages} ({totalMatches} total matches)
        </div>
      </div>
    </main>
  )
}
