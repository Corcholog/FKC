'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import Navbar from '@/app/components/Navbar'
import MatchCard from '@/app/components/MatchCard'

type Match = {
  id: number
  date: string
  match_type: string
  we_won: boolean
  duration_minutes: number
  duration_seconds: number
  match_id: string | null
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
    score?: number
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
  const [allMatches, setAllMatches] = useState<Match[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [resultFilter, setResultFilter] = useState<string>('all')
  const [championFilters, setChampionFilters] = useState<string[]>([])
  const [championSearch, setChampionSearch] = useState<string>('')
  const [enemyChampionFilters, setEnemyChampionFilters] = useState<string[]>([])
  const [enemyChampionSearch, setEnemyChampionSearch] = useState<string>('')
  const [sortBy, setSortBy] = useState<string>('date')

  const clearFilters = () => {
    setTypeFilter('all')
    setResultFilter('all')
    setChampionFilters([])
    setEnemyChampionFilters([])
    setSortBy('date')
    setCurrentPage(1)
  }

  const hasActiveFilters = typeFilter !== 'all' || resultFilter !== 'all' || championFilters.length > 0 || enemyChampionFilters.length > 0 || sortBy !== 'date'

  const supabase = createClient()

  useEffect(() => {
    const fetchAllMatches = async () => {
      setLoading(true)

      const { data, error } = await supabase.from('matches').select(`
          *,
          ally_participants(*),
          enemy_participants(*),
          match_bans(*)
      `).order('date', { ascending: false })

      if (!error && data) {
        setAllMatches(data as Match[])
      }
      setLoading(false)
    }

    fetchAllMatches()
  }, [])

  // In-memory filtering
  const filteredMatches = allMatches.filter(match => {
    let typeMatches = true
    if (typeFilter === 'competitive') {
      const exclude = ['flex', 'scrim_bo1', 'scrim_bo3', 'scrim', 'clash']
      typeMatches = !exclude.includes(match.match_type)
    } else if (typeFilter === 'scrims') {
      typeMatches = ['scrim_bo1', 'scrim_bo3', 'scrim'].includes(match.match_type)
    } else if (typeFilter !== 'all') {
      typeMatches = match.match_type === typeFilter
    }

    let resultMatches = true
    if (resultFilter === 'victory') {
      resultMatches = match.we_won === true
    } else if (resultFilter === 'defeat') {
      resultMatches = match.we_won === false
    }

    let championMatches = true
    if (championFilters.length > 0) {
      championMatches = championFilters.every(champ => match.ally_participants.some(p => p.champion === champ))
    }

    let enemyChampionMatches = true
    if (enemyChampionFilters.length > 0) {
      enemyChampionMatches = enemyChampionFilters.every(champ => match.enemy_participants.some(p => p.champion === champ))
    }

    return typeMatches && resultMatches && championMatches && enemyChampionMatches
  })

  // Pagination and Sorting logic
  const filteredCount = filteredMatches.length
  
  const sortedMatches = [...filteredMatches].sort((a, b) => {
    if (sortBy === 'duration') {
      const durationA = (a.duration_minutes * 60) + a.duration_seconds;
      const durationB = (b.duration_minutes * 60) + b.duration_seconds;
      return durationB - durationA; // Longest first
    } else if (sortBy === 'kills') {
      const killsA = a.ally_participants.reduce((sum, p) => sum + p.kills, 0);
      const killsB = b.ally_participants.reduce((sum, p) => sum + p.kills, 0);
      return killsB - killsA;
    } else if (sortBy === 'deaths') {
      const deathsA = a.ally_participants.reduce((sum, p) => sum + p.deaths, 0);
      const deathsB = b.ally_participants.reduce((sum, p) => sum + p.deaths, 0);
      return deathsB - deathsA;
    }
    // Default is date (already ordered by db but fallback if sorting was changed)
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const totalPages = Math.max(1, Math.ceil(filteredCount / MATCHES_PER_PAGE))
  const offset = (currentPage - 1) * MATCHES_PER_PAGE
  const displayedMatches = sortedMatches.slice(offset, offset + MATCHES_PER_PAGE)

  // Calculate Combination Stats
  let winrate = 0;
  let avgDurationStr = "0:00";
  let avgKills = 0;
  let avgDeaths = 0;
  let avgAssists = 0;
  
  if (filteredCount > 0) {
    const wins = filteredMatches.filter(m => m.we_won).length;
    winrate = Math.round((wins / filteredCount) * 100);
    
    let totalSeconds = 0;
    let totalKills = 0;
    let totalDeaths = 0;
    let totalAssists = 0;
    
    filteredMatches.forEach(m => {
      totalSeconds += (m.duration_minutes * 60) + m.duration_seconds;
      m.ally_participants.forEach(p => {
         totalKills += p.kills;
         totalDeaths += p.deaths;
         totalAssists += p.assists;
      });
    });

    const avgSeconds = Math.round(totalSeconds / filteredCount);
    avgDurationStr = `${Math.floor(avgSeconds / 60)}:${(avgSeconds % 60).toString().padStart(2, '0')}`;
    avgKills = totalKills / filteredCount;
    avgDeaths = totalDeaths / filteredCount;
    avgAssists = totalAssists / filteredCount;
  }

  let wrColorClass = "bg-[#f1c40f]/10 border-[#f1c40f]/30";
  let wrTextClass = "text-[#d4ac0d]";
  if (winrate >= 60) {
    wrColorClass = "bg-emerald-500/10 border-emerald-500/30";
    wrTextClass = "text-emerald-500";
  } else if (winrate <= 40) {
    wrColorClass = "bg-rose-500/10 border-rose-500/30";
    wrTextClass = "text-rose-500";
  }

  // Reset pagination when using filters
  const handleTypeFilter = (val: string) => {
    setTypeFilter(val)
    setCurrentPage(1)
  }

  const handleResultFilter = (val: string) => {
    setResultFilter(val)
    setCurrentPage(1)
  }

  const handleChampionSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setChampionSearch(val)

    const isMatch = allChampions.find(c => c.toLowerCase() === val.toLowerCase())
    if (isMatch && !championFilters.includes(isMatch)) {
      setChampionFilters(prev => [...prev, isMatch])
      setCurrentPage(1)
      setChampionSearch('')
    }
  }

  const removeChampionFilter = (champ: string) => {
    setChampionFilters(prev => prev.filter(c => c !== champ))
    setCurrentPage(1)
  }

  const handleEnemyChampionSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setEnemyChampionSearch(val)

    const isMatch = allChampions.find(c => c.toLowerCase() === val.toLowerCase())
    if (isMatch && !enemyChampionFilters.includes(isMatch)) {
      setEnemyChampionFilters(prev => [...prev, isMatch])
      setCurrentPage(1)
      setEnemyChampionSearch('')
    }
  }

  const removeEnemyChampionFilter = (champ: string) => {
    setEnemyChampionFilters(prev => prev.filter(c => c !== champ))
    setCurrentPage(1)
  }

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
      if (p.role) acc[p.role.toLowerCase()] = p
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
    const overrides: Record<string, string> = { "Bel'Veth": "Belveth", "Cho'Gath": "Chogath", "Kai'Sa": "Kaisa", "Kha'Zix": "Khazix", "K'Sante": "KSante", "Rek'Sai": "RekSai", "Vel'Koz": "Velkoz", "Wukong": "MonkeyKing", "LeBlanc": "Leblanc", "RenataGlasc": "Renata" }
    const key = overrides[match] ?? match.replace(/[^a-zA-Z0-9]/g, '')
    return `https://ddragon.leagueoflegends.com/cdn/16.7.1/img/champion/${key}.png`
  }

  return (
    <main className="min-h-screen bg-background text-foreground pb-20 pt-16">

      {/* Navigation Bar */}
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6">
          <div>
            <h1 className="text-5xl font-black mb-2 text-foreground">Match History</h1>
            <p className="text-slate-500 dark:text-slate-400 font-semibold">
              Showing {filteredCount} of {allMatches.length} total matches
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-3">
            {/* Controls (Sort & Clear) */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sort By:</span>
                <select
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}
                  className="bg-card text-slate-600 dark:text-slate-300 border border-blue-200 dark:border-[#322814] rounded-sm px-2 py-1 text-xs font-bold shadow-sm focus:outline-none focus:border-[#f1c40f]"
                >
                  <option value="date">Date (Newest)</option>
                  <option value="duration">Game Duration</option>
                  <option value="kills">Most Kills</option>
                  <option value="deaths">Most Deaths</option>
                </select>
              </div>

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs font-bold text-red-500 hover:text-red-400 transition-colors flex items-center gap-1 bg-red-500/10 px-2 py-1 rounded-sm border border-red-500/20 shadow-sm"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                  Clear All Filters
                </button>
              )}
            </div>

            {/* Match Type */}
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: 'All Matches' },
                { id: 'competitive', label: 'Competitive' },
                { id: 'scrims', label: 'Scrims' },
                { id: 'flex', label: 'Flex' },
                { id: 'clash', label: 'Clash' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => handleTypeFilter(f.id)}
                  className={`px-3 py-1.5 rounded-none text-xs font-bold transition-all border shadow-sm ${typeFilter === f.id
                    ? 'bg-[#f1c40f] text-slate-900 border-yellow-500 shadow-md'
                    : 'bg-card text-slate-600 dark:text-slate-300 border-blue-200 dark:border-[#322814] hover:border-[#f1c40f] hover:text-[#f39c12]'
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Result */}
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: 'Any Result', colorClass: 'hover:border-slate-400 hover:text-slate-600', activeClass: 'bg-slate-700 text-white border-slate-700 shadow-md' },
                { id: 'victory', label: 'Victories', colorClass: 'hover:border-emerald-400 hover:text-emerald-500', activeClass: 'bg-emerald-500 text-white border-emerald-500 shadow-md' },
                { id: 'defeat', label: 'Defeats', colorClass: 'hover:border-rose-400 hover:text-rose-500', activeClass: 'bg-rose-500 text-white border-rose-500 shadow-md' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => handleResultFilter(f.id)}
                  className={`px-3 py-1.5 rounded-none text-xs font-bold transition-all border shadow-sm ${resultFilter === f.id
                    ? f.activeClass
                    : `bg-card text-slate-600 dark:text-slate-300 border-blue-200 dark:border-[#322814] ${f.colorClass}`
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Champion Filters Container */}
            <div className="flex flex-wrap gap-6 mt-1">
              {/* Ally Champion Filter */}
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  list="champions-list"
                  value={championSearch}
                  onChange={handleChampionSearch}
                  placeholder="Search Ally Champion..."
                  className="bg-card text-slate-600 dark:text-slate-300 border border-blue-200 dark:border-[#322814] rounded-none px-3 py-1.5 text-xs font-bold transition-all shadow-sm w-max focus:outline-none focus:border-[#f1c40f] placeholder:font-normal"
                />
                <datalist id="champions-list">
                  {allChampions.filter(c => !championFilters.includes(c)).map(c => (
                    <option key={c} value={c} />
                  ))}
                </datalist>

                {/* Active Ally Champion Filters */}
                {championFilters.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-wrap gap-2">
                      {championFilters.map(champ => (
                        <span
                          key={champ}
                          className="inline-flex items-center gap-1.5 bg-slate-800 dark:bg-slate-700 text-slate-100 border border-slate-600 px-2.5 py-1 rounded-sm text-xs font-bold shadow-sm"
                        >
                          {getChampionIcon(champ) && (
                            <img
                              src={getChampionIcon(champ) as string}
                              alt={champ}
                              className="w-4 h-4 border border-slate-500 object-cover"
                            />
                          )}
                          {champ}
                          <button
                            onClick={() => removeChampionFilter(champ)}
                            className="hover:text-red-400 focus:outline-none flex items-center justify-center transition-colors"
                            aria-label={`Remove ${champ} filter`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Enemy Champion Filter */}
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  list="enemy-champions-list"
                  value={enemyChampionSearch}
                  onChange={handleEnemyChampionSearch}
                  placeholder="Search Enemy Champion..."
                  className="bg-card text-slate-600 dark:text-slate-300 border border-blue-200 dark:border-[#322814] rounded-none px-3 py-1.5 text-xs font-bold transition-all shadow-sm w-max focus:outline-none focus:border-red-500 placeholder:font-normal"
                />
                <datalist id="enemy-champions-list">
                  {allChampions.filter(c => !enemyChampionFilters.includes(c)).map(c => (
                    <option key={c} value={c} />
                  ))}
                </datalist>

                {/* Active Enemy Champion Filters */}
                {enemyChampionFilters.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-wrap gap-2">
                      {enemyChampionFilters.map(champ => (
                        <span
                          key={champ}
                          className="inline-flex items-center gap-1.5 bg-slate-800 dark:bg-slate-700 text-slate-100 border border-slate-600 px-2.5 py-1 rounded-sm text-xs font-bold shadow-sm"
                        >
                          {getChampionIcon(champ) && (
                            <img
                              src={getChampionIcon(champ) as string}
                              alt={champ}
                              className="w-4 h-4 border border-slate-500 object-cover"
                            />
                          )}
                          {champ}
                          <button
                            onClick={() => removeEnemyChampionFilter(champ)}
                            className="hover:text-red-400 focus:outline-none flex items-center justify-center transition-colors"
                            aria-label={`Remove ${champ} filter`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Advanced Stats for Combination */}
            {resultFilter === 'all' && (championFilters.length > 0 || enemyChampionFilters.length > 0) && filteredCount > 0 && (
              <div className={`flex flex-wrap items-center gap-4 px-4 py-2 rounded-sm w-max mt-2 border ${wrColorClass}`}>
                <div className="flex flex-col">
                  <span className={`text-sm font-black ${wrTextClass}`}>
                    {winrate}% WR
                  </span>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    ({filteredMatches.filter(m => m.we_won).length}W - {filteredCount - filteredMatches.filter(m => m.we_won).length}L)
                  </span>
                </div>
                
                <div className="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
                
                <div className="flex flex-col">
                  <span className="text-sm font-black text-slate-700 dark:text-slate-200">
                    {avgDurationStr}
                  </span>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Avg Duration
                  </span>
                </div>

                <div className="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
                
                <div className="flex flex-col">
                  <span className="text-sm font-black text-slate-700 dark:text-slate-200">
                    {avgDeaths === 0 ? (avgKills + avgAssists).toFixed(2) : ((avgKills + avgAssists) / avgDeaths).toFixed(2)} KDA
                  </span>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Avg Team KDA
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Matches List */}
        <div className="grid gap-6 relative z-10">
          {loading ? (
            <div className="text-center py-12 text-slate-500">Loading matches...</div>
          ) : displayedMatches.length > 0 ? (
            displayedMatches.map((match) => (
              <MatchCard key={match.id} match={match} allChampions={allChampions} />
            ))
          ) : (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 font-medium bg-card border border-blue-100 dark:border-[#322814] rounded-sm shadow-sm">No matches found</div>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-4 p-4 mt-4">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-6 py-2 bg-[#f1c40f] hover:bg-[#f39c12] disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-900 shadow-md font-bold rounded-none transition-all"
            >
              ← Previous
            </button>

            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-10 h-10 rounded-none font-bold transition-all shadow-sm ${currentPage === page
                    ? 'bg-[#f1c40f] text-slate-900 border border-yellow-500'
                    : 'bg-card text-slate-600 dark:text-slate-300 border border-blue-200 dark:border-[#322814] hover:border-[#f1c40f] hover:text-[#f39c12]'
                    }`}
                >
                  {page}
                </button>
              ))}
            </div>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-6 py-2 bg-[#f1c40f] hover:bg-[#f39c12] disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-900 shadow-md font-bold rounded-none transition-all"
            >
              Next →
            </button>
          </div>
        )}

        {/* Page Info */}
        <div className="mt-4 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
          Page {currentPage} of {totalPages} ({filteredCount} matches)
        </div>
      </div>
    </main>
  )
}
