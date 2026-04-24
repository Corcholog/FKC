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

    return typeMatches && resultMatches
  })

  // Pagination logic
  const totalMatches = filteredMatches.length
  const totalPages = Math.max(1, Math.ceil(totalMatches / MATCHES_PER_PAGE))
  const offset = (currentPage - 1) * MATCHES_PER_PAGE
  const displayedMatches = filteredMatches.slice(offset, offset + MATCHES_PER_PAGE)

  // Reset pagination when using filters
  const handleTypeFilter = (val: string) => {
    setTypeFilter(val)
    setCurrentPage(1)
  }

  const handleResultFilter = (val: string) => {
    setResultFilter(val)
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
    const overrides: Record<string, string> = { "Bel'Veth":"Belveth","Cho'Gath":"Chogath","Kai'Sa":"Kaisa","Kha'Zix":"Khazix","K'Sante":"KSante","Rek'Sai":"RekSai","Vel'Koz":"Velkoz", "Wukong": "MonkeyKing" }
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
            <p className="text-slate-500 dark:text-slate-400 font-semibold">Total matches: {totalMatches}</p>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-3">
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border shadow-sm ${
                    typeFilter === f.id 
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border shadow-sm ${
                    resultFilter === f.id 
                      ? f.activeClass
                      : `bg-card text-slate-600 dark:text-slate-300 border-blue-200 dark:border-[#322814] ${f.colorClass}`
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
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
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 font-medium bg-card border border-blue-100 dark:border-[#322814] rounded-2xl shadow-sm">No matches found</div>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-4 p-4 mt-4">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-6 py-2 bg-[#f1c40f] hover:bg-[#f39c12] disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-900 shadow-md font-bold rounded-lg transition-all"
            >
              ← Previous
            </button>

            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-10 h-10 rounded-lg font-bold transition-all shadow-sm ${
                    currentPage === page
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
              className="px-6 py-2 bg-[#f1c40f] hover:bg-[#f39c12] disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-900 shadow-md font-bold rounded-lg transition-all"
            >
              Next →
            </button>
          </div>
        )}

        {/* Page Info */}
        <div className="mt-4 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
          Page {currentPage} of {totalPages} ({totalMatches} total matches)
        </div>
      </div>
    </main>
  )
}
