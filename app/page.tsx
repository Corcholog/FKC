// app/page.tsx
import { createClient } from '@/lib/supabase/server'
import Image from 'next/image'
import Link from 'next/link'
import Navbar from '@/app/components/Navbar'
import DurationChart from '@/app/components/DurationChart'
import MatchCard from '@/app/components/MatchCard'
import Countdown from '@/app/components/Countdown'
import PlayerLinks from '@/app/components/PlayerLinks'
import RosterSection from '@/app/components/RosterSection'

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
    .select('id, we_won, match_type, duration_minutes')
  const allMatches = allMatchesData || []

  // Fetch all player performances for the Roster Stats
  const { data: allPerformancesData } = await supabase
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
      matches!inner (id, we_won)
    `)
  const allPerformances = allPerformancesData || []

  // Fetch all soloq matches
  const { data: allSoloQData } = await supabase
    .from('soloq_matches')
    .select('*')
  const soloqPerformances = allSoloQData || []

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
    <main className="min-h-screen bg-background text-foreground pb-20 pt-16">

      {/* Navigation Bar */}
      <Navbar />

      {/* Hero Banner + Countdown Row */}
      <div className="flex flex-col xl:flex-row w-full border-b border-blue-200 dark:border-[#322814]">

        {/* Hero Banner (70%) */}
        <div className="relative w-full xl:w-[70%] h-[500px] xl:h-[600px] flex items-center justify-center overflow-hidden bg-gradient-to-b from-[#74b9ff]/80 to-[#f4faff] dark:from-[#010a13]/80 dark:to-[#091428]">
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

        {/* Countdown (30%) */}
        <div className="w-full xl:w-[30%] flex items-stretch">
          <Countdown />
        </div>
      </div>

      {/* Roster with Integrated Stats */}
      <RosterSection
        playerList={playerList}
        teamPerformances={allPerformances}
        soloqPerformances={soloqPerformances}
      />

      {/* Team Performance */}
      <div className="bg-blue-50 dark:bg-[#091428] py-16 border-y border-[#bae6fd] dark:border-[#322814] shadow-inner relative z-20">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-black mb-10 text-center text-foreground drop-shadow-sm">Team Performance</h2>
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap justify-center gap-8 text-center">
              {standardMatchTypes.map(type => (
                <div key={type} className="w-full sm:w-48 bg-card p-8 rounded-[2rem] border border-blue-100 dark:border-[#322814] shadow-xl shadow-blue-900/5 flex flex-col justify-center transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-900/10 hover:border-blue-200">
                  <div className="text-5xl font-black text-[#0984e3] drop-shadow-sm">{calculateWinrate(type)}</div>
                  <div className="mt-3 text-slate-500 font-black text-xs tracking-widest uppercase">{type.replace(/_/g, ' ')}</div>
                </div>
              ))}
              {/* Overall WR Box (Estilo Dorado/Destacado) */}
              <div className="w-full sm:w-48 bg-card p-8 rounded-[2rem] border-2 border-[#f1c40f]/60 shadow-xl shadow-yellow-900/5 flex flex-col justify-center transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-yellow-900/10">
                <div className="text-5xl font-black text-[#f39c12] drop-shadow-sm">{calculateWinrate()}</div>
                <div className="mt-3 text-[#f39c12] font-black tracking-widest text-xs uppercase">OVERALL WR</div>
              </div>
            </div>

            {competitiveMatchTypes.length > 0 && (
              <div className="flex flex-wrap justify-center gap-8 text-center pt-4">
                {/* Competitive WR Box (Estilo Púrpura) */}
                <div className="w-full sm:w-48 bg-card p-8 rounded-[2rem] border-2 border-purple-200 dark:border-purple-900 shadow-xl shadow-purple-900/5 flex flex-col justify-center transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-purple-900/10">
                  <div className="text-5xl font-black text-purple-600 drop-shadow-sm">{calculateWinrate(excludeTypes, true)}</div>
                  <div className="mt-3 text-purple-600/80 font-black tracking-widest text-xs uppercase">COMPETITIVE WR</div>
                </div>
                {competitiveMatchTypes.map(type => (
                  <div key={type} className="w-full sm:w-48 bg-card p-8 rounded-[2rem] border border-blue-100 dark:border-[#322814] shadow-xl shadow-blue-900/5 flex flex-col justify-center transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-900/10 hover:border-blue-200">
                    <div className="text-5xl font-black text-[#0984e3] drop-shadow-sm">{calculateWinrate(type)}</div>
                    <div className="mt-3 text-slate-500 font-black text-xs tracking-widest uppercase">{type.replace(/_/g, ' ')}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Charts Row */}
            <div className="flex flex-wrap justify-center gap-6 pt-8 mt-2">
              <DurationChart title="Overall Winrate by Duration" matches={allMatches} />
              <DurationChart title="Competitive Winrate by Duration" matches={competitiveMatches} />
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
            <MatchCard key={match.id} match={match} allChampions={allChampions} />
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