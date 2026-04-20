'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import Navbar from '@/app/components/Navbar'

type Player = {
  id: number
  name: string
  ign: string
  role: string
  puuid: string
}

type FormData = {
  date: string
  match_type: string
  our_side: 'Blue' | 'Red'
  we_won: boolean
  duration_minutes: number
  duration_seconds: number
  enemy_team_name: string
  notes: string
  matchId?: string
  our_bans: string[]
  enemy_bans: string[]
  our_participants: {
    player_id: number
    champion: string
    role: string
    kills: number
    deaths: number
    assists: number
    cs: number
    score: number
  }[]
  enemy_participants: {
    champion: string
    role: string
    kills: number
    deaths: number
    assists: number
    cs: number
  }[]
}

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

const roles = ['Top', 'Jungle', 'Mid', 'ADC', 'Support']

const getChampionIcon = (champion: string): string | undefined => {
  if (!champion?.trim()) return undefined
  const normalize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  const match = allChampions.find(c => normalize(c) === normalize(champion))
  if (!match) return undefined
  const overrides: Record<string, string> = { "Bel'Veth":"Belveth","Cho'Gath":"Chogath","Kai'Sa":"Kaisa","Kha'Zix":"Khazix","K'Sante":"KSante","Rek'Sai":"RekSai","Vel'Koz":"Velkoz", "Wukong": "MonkeyKing" }
  const key = overrides[match] ?? match.replace(/[^a-zA-Z0-9]/g, '')
  return `https://ddragon.leagueoflegends.com/cdn/16.7.1/img/champion/${key}.png`
}

export default function AdminForm({ players }: { players: Player[] }) {
  const now = new Date().toISOString().slice(0, 16)
  const [activeTab, setActiveTab] = useState<'auto' | 'import-id' | 'manual'>('auto')
  const [importMatchId, setImportMatchId] = useState('')
  const [importMatchIdRiotId, setImportMatchIdRiotId] = useState('Corshus#2108')
  const [importSummonerName, setImportSummonerName] = useState('')
  const [importCount, setImportCount] = useState(10)
  const [isImporting, setIsImporting] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const [skippedLogs, setSkippedLogs] = useState<{ date: string, players: string[] }[]>([])

  const [formData, setFormData] = useState<FormData>({
    date: now,
    match_type: 'flex',
    our_side: 'Blue',
    we_won: false,
    duration_minutes: 30,
    duration_seconds: 0,
    enemy_team_name: '',
    notes: '',
    our_bans: ['', '', '', '', ''],
    enemy_bans: ['', '', '', '', ''],
    our_participants: roles.map(role => {
      const player = players.find(p => p.role === role)
      return {
        role,
        player_id: player?.id || 0,
        champion: '',
        kills: 0,
        deaths: 0,
        assists: 0,
        cs: 0,
        score: 0,
      }
    }),
    enemy_participants: roles.map(role => ({
      champion: '',
      role,
      kills: 0,
      deaths: 0,
      assists: 0,
      cs: 0,
    })),
  })

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleImportById = async () => {
    if (!importMatchId.trim()) return;
    setIsImporting(true)
    setImportMessage('')
    try {
      const [gameName, tagLine] = importMatchIdRiotId.split('#')
      const res = await fetch('/api/import-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: importMatchId.trim(), gameName, tagLine })
      })
      const result = await res.json()
      if (!result.success) throw new Error(result.error)

      const m = result.match
      const newFormData = { ...formData }
      if (m.date) newFormData.date = m.date
      newFormData.match_type = m.match_type || 'tournament'
      newFormData.our_side = m.our_side || 'Blue'
      newFormData.we_won = m.we_won || false
      newFormData.duration_minutes = m.duration_minutes || 0
      newFormData.duration_seconds = m.duration_seconds || 0
      newFormData.enemy_team_name = '' 
      newFormData.notes = `Imported from Match ID: ${m.matchId}`
      newFormData.matchId = m.matchId || importMatchId.trim()
      
      newFormData.our_bans = [...(m.our_bans || []), '', '', '', '', ''].slice(0, 5)
      newFormData.enemy_bans = [...(m.enemy_bans || []), '', '', '', '', ''].slice(0, 5)
      
      newFormData.our_participants = [...newFormData.our_participants]
      if (m.our_participants?.length) {
        m.our_participants.forEach((p:any, i:number) => {
          if (i < 5) {
            newFormData.our_participants[i] = {
              ...newFormData.our_participants[i],
              champion: p.champion, kills: p.kills, deaths: p.deaths, assists: p.assists, cs: p.cs,
              score: p.score || 0
            }
          }
        })
      }

      newFormData.enemy_participants = [...newFormData.enemy_participants]
      if (m.enemy_participants?.length) {
        m.enemy_participants.forEach((p:any, i:number) => {
          if (i < 5) {
            newFormData.enemy_participants[i] = {
              ...newFormData.enemy_participants[i],
              champion: p.champion, kills: p.kills, deaths: p.deaths, assists: p.assists, cs: p.cs
            }
          }
        })
      }
      
      setFormData(newFormData)
      setActiveTab('manual')
      setImportMatchId('') 
      setImportMessage('✅ Successfully loaded match. Please review and save.')

    } catch (err: any) {
      setImportMessage(`❌ Error: ${err.message}`)
    } finally {
      setIsImporting(false)
    }
  }

  const handleManualSubmit = async (e: React.FormEvent) => {
      e.preventDefault()
      setLoading(true)
      setMessage('')
      try {
        await insertMatchToDb(formData, true)
        setMessage('✅ Match added successfully!')
      } catch (error: any) {
        setMessage('❌ Error: ' + error.message)
      } finally {
        setLoading(false)
      }
    }

  const updateFormData = (key: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  const updateBans = (team: 'our' | 'enemy', index: number, value: string) => {
    const key = `${team}_bans` as 'our_bans' | 'enemy_bans'
    setFormData(prev => ({
      ...prev,
      [key]: prev[key].map((ban, i) => i === index ? value : ban)
    }))
  }

  const updateOurParticipant = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      our_participants: prev.our_participants.map((p, i) =>
        i === index ? { ...p, [field]: value } : p
      )
    }))
  }

  const updateEnemyParticipant = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      enemy_participants: prev.enemy_participants.map((p, i) =>
        i === index ? { ...p, [field]: value } : p
      )
    }))
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  const insertMatchToDb = async (matchData: any, isManual: boolean = false) => {
      const supabase = createClient()

      const { data: match, error: matchError } = await supabase
        .from('matches')
        .insert({
          date: new Date(matchData.date).toISOString(),
          match_type: matchData.match_type,
          our_side: matchData.our_side || 'Blue', // Failsafe check
          we_won: matchData.we_won,
          duration_minutes: matchData.duration_minutes,
          duration_seconds: matchData.duration_seconds,
          enemy_team_name: matchData.enemy_team_name || null,
          notes: matchData.notes || null,
          match_id: matchData.matchId ? matchData.matchId.split('_').pop() : null,
        })
        .select('id')
        .single()

      if (matchError) throw matchError
      const matchId = match.id

      const allyParticipantsData = matchData.our_participants.map((p: any) => {
        let dbPlayerId = p.player_id;
        if (!isManual) {
          const dbPlayer = players.find(player => player.puuid === p.puuid);
          dbPlayerId = dbPlayer?.id || 0;
        }

        return {
          match_id: matchId,
          player_id: dbPlayerId,
          champion: p.champion.trim() || 'Unknown',
          role: p.role,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          cs: p.cs,
          score: p.score || 0
        }
      })
      
      await supabase.from('ally_participants').insert(allyParticipantsData)

      const enemyParticipantsData = matchData.enemy_participants.map((p: any) => ({
        match_id: matchId,
        champion: p.champion.trim() || 'Unknown',
        role: p.role,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        cs: p.cs,
      }))
      
      await supabase.from('enemy_participants').insert(enemyParticipantsData)

      await supabase.from('match_bans').insert({
        match_id: matchId,
        our_bans: matchData.our_bans.filter((b: string) => b.trim() !== '' && b !== 'None' && b !== 'Unknown'),
        enemy_bans: matchData.enemy_bans.filter((b: string) => b.trim() !== '' && b !== 'None' && b !== 'Unknown'),
      })
    }

  const handleImportFlexMatches = async () => {
    const input = importSummonerName.trim()
    if (!input) return setImportMessage("❌ Please enter a Riot ID")
    setIsImporting(true)
    setImportMessage('Preparing import and checking for existing matches...')
    setSkippedLogs([]) // Reset the logs on a new run

    const waitWithCountdown = async (seconds: number) => {
      for (let i = seconds; i > 0; i--) {
        setImportMessage(`⏳ Riot API limit reached. Auto-resuming in ${i} seconds...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); 
      }
      setImportMessage(`🚀 Resuming import...`);
    }

    try {
      let gameName = input, tagLine = "LAN"
      if (input.includes('#')) {
        const parts = input.split('#')
        gameName = parts[0].trim()
        tagLine = parts[1]?.trim() || "LAN"
      }

      const supabase = createClient()
      const { data: existingMatches } = await supabase.from('matches').select('date')
      const existingDates = new Set(existingMatches?.map(m => new Date(m.date).getTime()) || [])

      const isKnownPlayer = (puuid: string) => {
        if (!puuid) return false;
        return players.some(p => p.puuid?.trim() === puuid.trim())
      }

      let insertedCount = 0;
      let startIdx = 0;
      const BATCH_SIZE = 10;
      const MAX_SEARCH = 200; 
      
      // Temporary array to hold our skipped matches during the loop
      const localSkipped: { date: string, players: string[] }[] = [];

      while (insertedCount < importCount && startIdx < MAX_SEARCH) {
        setImportMessage(`Scanning match history (Checked ${startIdx} games so far)...`)

        const response = await fetch('/api/import-flex', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameName, tagLine, count: BATCH_SIZE, start: startIdx }),
        })
        
        if (response.status === 429) {
          await waitWithCountdown(120); 
          continue; 
        }

        const result = await response.json()
        if (!response.ok) throw new Error(result.error)
        
        if (result.matches.length === 0 && !result.rateLimited) break; 

        for (const match of result.matches) {
          if (insertedCount >= importCount) break;

          const matchTime = new Date(match.date).getTime()
          if (existingDates.has(matchTime)) continue;

          const knownAlliesCount = match.our_participants.filter((p: any) => isKnownPlayer(p.puuid)).length;

          if (knownAlliesCount === 5) {
            await insertMatchToDb(match, false)
            existingDates.add(matchTime) 
            insertedCount++;
            setImportMessage(`✅ Added ${insertedCount} of ${importCount} valid full-stack matches...`)
          } else {
            // Track the match that failed the roster check
            localSkipped.push({
              date: new Date(match.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
              players: match.our_participants.map((p: any) => p.riotId)
            });
          }
        }

        if (result.rateLimited) {
          startIdx += result.matches.length; 
          await waitWithCountdown(120);
        } else {
          startIdx += BATCH_SIZE; 
        }
      }

      // Save the tracked skips to our React state to display them
      setSkippedLogs(localSkipped);

      if (insertedCount === 0) {
        setImportMessage(`❌ Found no new full-team Flex games in the last ${startIdx} matches.`)
      } else if (insertedCount < importCount) {
        setImportMessage(`✅ Finished! Found and added ${insertedCount} valid matches (Searched ${startIdx} total).`)
      } else {
        setImportMessage(`✅ Success! ${insertedCount} matches imported directly to DB.`)
      }

    } catch (error: any) {
      setImportMessage(`❌ Error: ${error.message}`)
    } finally {
      setIsImporting(false)
    }
  }
return (
  <>
    <Navbar />
    <div className="w-full max-w-6xl mx-auto px-8 pt-24 pb-8 bg-[#f4faff] text-slate-900">
      {/* Header and Logout */}
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-4xl font-black text-[#0f172a]">Match Admin</h1>
        <button onClick={handleLogout} className="px-6 py-2 bg-rose-500 text-white font-bold rounded-lg shadow-sm hover:bg-rose-600 transition-all">Logout</button>
      </div>

      {/* Tabs */}
      <div className="flex justify-between items-center mb-8 border-b border-blue-200 pb-4">
        <div className="flex gap-4">
          <button 
            onClick={() => setActiveTab('auto')}
            className={`px-6 py-3 rounded-lg font-bold transition-all shadow-sm ${activeTab === 'auto' ? 'bg-[#0984e3] text-white shadow-md' : 'bg-white border border-blue-100 text-slate-500 hover:bg-blue-50'}`}
          >
            Auto Import (Flex)
          </button>
          <button 
            onClick={() => setActiveTab('import-id')}
            className={`px-6 py-3 rounded-lg font-bold transition-all shadow-sm ${activeTab === 'import-id' ? 'bg-purple-600 text-white shadow-md' : 'bg-white border border-blue-100 text-slate-500 hover:bg-blue-50'}`}
          >
            Import by ID
          </button>
          <button 
            onClick={() => setActiveTab('manual')}
            className={`px-6 py-3 rounded-lg font-bold transition-all shadow-sm ${activeTab === 'manual' ? 'bg-[#f1c40f] text-slate-900 border border-yellow-500 shadow-md' : 'bg-white border border-blue-100 text-slate-500 hover:bg-blue-50'}`}
          >
            Manual Input
          </button>
        </div>
        <button 
          onClick={async () => {
            if (!confirm('Recalculate all scores? This may take a few minutes.')) return;
            setLoading(true);
            try {
              const res = await fetch('/api/matches/recalculate-scores', { method: 'POST', body: JSON.stringify({force: true}) });
              const result = await res.json();
              alert(result.success ? `Done! Updated ${result.updated} scores.` : `Error: ${result.error}`);
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 border border-emerald-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all shadow-sm"
        >
          {loading ? 'Processing...' : 'Recalculate Database Scores'}
        </button>
      </div>

      {/* AUTO IMPORT SECTION */}
      {activeTab === 'auto' && (
        <section className="bg-white border border-blue-100 p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <h2 className="text-2xl font-black mb-4 text-[#0984e3]">Fetch & Insert Directly to DB</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Riot ID (Name#Tag)</label>
              <input type="text" value={importSummonerName} onChange={(e) => setImportSummonerName(e.target.value)} className="w-full p-3 bg-blue-50/50 border border-blue-200 rounded-lg focus:border-[#0984e3] focus:ring-1 focus:ring-[#0984e3] outline-none transition-all" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Target Valid Matches</label>
              <input type="number" value={importCount} onChange={(e) => setImportCount(Number(e.target.value))} min="1" max="50" className="w-full p-3 bg-blue-50/50 border border-blue-200 rounded-lg focus:border-[#0984e3] focus:ring-1 focus:ring-[#0984e3] outline-none transition-all" />
            </div>
            <div className="flex items-end">
              <button 
                onClick={handleImportFlexMatches} 
                disabled={isImporting}
                className="w-full py-3 bg-[#0984e3] hover:bg-blue-600 disabled:bg-slate-300 text-white font-bold rounded-lg transition-all shadow-md"
              >
                {isImporting ? 'Processing...' : 'Fetch & Insert'}
              </button>
            </div>
          </div>
          {importMessage && (
            <div className={`p-3 rounded-lg font-bold border ${importMessage.includes('❌') ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
              {importMessage}
            </div>
          )}
          
          {/* ADD THIS NEW BLOCK: Skipped Matches Log */}
          {skippedLogs.length > 0 && (
            <div className="mt-4 border border-blue-200 bg-white rounded-xl overflow-hidden shadow-sm">
              <div className="bg-blue-50/80 p-3 border-b border-blue-100 flex justify-between items-center">
                <h3 className="font-black text-slate-700">Skipped Matches ({skippedLogs.length})</h3>
                <span className="text-xs font-bold text-slate-500">Missing Full Roster</span>
              </div>
              <div className="max-h-60 overflow-y-auto p-4 space-y-3">
                {skippedLogs.map((log, idx) => (
                  <div key={idx} className="text-sm border-b border-blue-100 pb-2 last:border-0 last:pb-0">
                    <div className="text-slate-500 font-mono font-bold mb-1">{log.date}</div>
                    <div className="flex flex-wrap gap-2">
                      {log.players.map((riotId, pIdx) => {
                        // Highlight players that DO exist in our DB in green, and strangers in red
                        const isRecognized = players.some(p => p.ign.toLowerCase() === riotId.toLowerCase());
                        return (
                          <span key={pIdx} className={`px-2 py-0.5 rounded text-xs font-bold border ${isRecognized ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-rose-50 border-rose-200 text-rose-600'}`}>
                            {riotId}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* IMPORT BY ID SECTION */}
      {activeTab === 'import-id' && (
        <section className="bg-white border border-blue-100 p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <h2 className="text-2xl font-black mb-4 text-purple-600">Fetch Single Match by ID</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Target Match ID</label>
              <input type="text" value={importMatchId} onChange={(e) => setImportMatchId(e.target.value)} placeholder="e.g. 1587489137" className="w-full p-3 bg-blue-50/50 border border-blue-200 rounded-lg focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none transition-all" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Our Perspective (Riot ID)</label>
              <input type="text" value={importMatchIdRiotId} onChange={(e) => setImportMatchIdRiotId(e.target.value)} className="w-full p-3 bg-blue-50/50 border border-blue-200 rounded-lg focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none transition-all" />
            </div>
            <div className="flex items-end">
              <button 
                onClick={handleImportById} 
                disabled={isImporting}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white font-bold rounded-lg transition-all shadow-md"
              >
                {isImporting ? 'Fetching...' : 'Fetch & Pre-fill'}
              </button>
            </div>
          </div>
          {importMessage && (
            <div className={`p-3 rounded-lg font-bold border ${importMessage.includes('❌') ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
              {importMessage}
            </div>
          )}
        </section>
      )}

      {/* MANUAL INPUT SECTION */}
      {activeTab === 'manual' && (
        <form onSubmit={handleManualSubmit}>
           {/* Form sections kept identical to your structure... */}
          <div className="space-y-12">
            {/* Match Information */}
            <section>
              <h2 className="text-2xl font-black mb-4 text-[#0f172a]">Match Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1">Date & Time</label>
                  <input 
                    type="datetime-local" 
                    value={formData.date} 
                    onChange={(e) => updateFormData('date', e.target.value)} 
                    className="w-full p-3 bg-white border border-blue-200 rounded-lg outline-none focus:border-[#0984e3] focus:ring-1 focus:ring-[#0984e3] transition-all" 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1">Match Type</label>
                  <input 
                    type="text" 
                    value={formData.match_type} 
                    onChange={(e) => updateFormData('match_type', e.target.value.toLowerCase().replace(/\s+/g, '_'))} 
                    list="match-type-suggestions"
                    className="w-full p-3 bg-white border border-blue-200 rounded-lg outline-none focus:border-[#0984e3] focus:ring-1 focus:ring-[#0984e3] transition-all"
                    placeholder="e.g. flex, tournament, clash"
                  />
                  <datalist id="match-type-suggestions">
                    <option value="flex" />
                    <option value="scrim_bo1" />
                    <option value="scrim_bo3" />
                    <option value="clash" />
                    <option value="tournament" />
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1">Our Side</label>
                  <div className="flex gap-6 font-medium text-slate-700">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="our_side" value="Blue" checked={formData.our_side === 'Blue'} onChange={(e) => updateFormData('our_side', e.target.value as 'Blue' | 'Red')} className="accent-[#0984e3]" />
                      Blue
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="our_side" value="Red" checked={formData.our_side === 'Red'} onChange={(e) => updateFormData('our_side', e.target.value as 'Blue' | 'Red')} className="accent-rose-500" />
                      Red
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1">We Won</label>
                  <input type="checkbox" checked={formData.we_won} onChange={(e) => updateFormData('we_won', e.target.checked)} className="w-5 h-5 accent-emerald-500 cursor-pointer rounded" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1">Duration</label>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <input 
                        type="number" 
                        value={formData.duration_minutes || ''} 
                        onChange={(e) => updateFormData('duration_minutes', parseInt(e.target.value) || 0)} 
                        className="w-full p-3 bg-white border border-blue-200 rounded-lg text-center outline-none focus:border-[#0984e3] focus:ring-1 focus:ring-[#0984e3] transition-all" 
                        min="0" 
                        placeholder="Minutes" 
                      />
                    </div>
                    <div className="flex-1">
                      <input 
                        type="number" 
                        value={formData.duration_seconds || ''} 
                        onChange={(e) => updateFormData('duration_seconds', parseInt(e.target.value) || 0)} 
                        className="w-full p-3 bg-white border border-blue-200 rounded-lg text-center outline-none focus:border-[#0984e3] focus:ring-1 focus:ring-[#0984e3] transition-all" 
                        min="0" 
                        max="59" 
                        placeholder="Seconds" 
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1">Enemy Team Name</label>
                  <input type="text" value={formData.enemy_team_name} onChange={(e) => updateFormData('enemy_team_name', e.target.value)} className="w-full p-3 bg-white border border-blue-200 rounded-lg outline-none focus:border-[#0984e3] focus:ring-1 focus:ring-[#0984e3] transition-all" />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-bold text-slate-600 mb-1">Notes</label>
                <textarea value={formData.notes} onChange={(e) => updateFormData('notes', e.target.value)} className="w-full p-3 bg-white border border-blue-200 rounded-lg outline-none focus:border-[#0984e3] focus:ring-1 focus:ring-[#0984e3] transition-all" rows={3} />
              </div>
            </section>
            
            {/* Bans Section with Icon Preview */}
            <section className="bg-white p-6 rounded-2xl border border-blue-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
              <h2 className="text-2xl font-black mb-6 text-[#0f172a]">Bans</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Our Bans */}
                <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                  <h3 className="text-lg font-bold mb-3 text-emerald-600">Our Bans</h3>
                  <div className="grid grid-cols-5 gap-3">
                    {formData.our_bans.map((ban, index) => (
                      <div key={index} className="relative">
                        <input 
                          type="text" 
                          list="all-champions"
                          value={ban} 
                          onChange={(e) => updateBans('our', index, e.target.value)} 
                          placeholder={`Ban ${index + 1}`} 
                          className="w-full px-2 py-3 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-all font-medium text-slate-800 placeholder-slate-400" 
                        />
                        {getChampionIcon(ban) && (
                          <Image 
                            src={getChampionIcon(ban)!} 
                            alt={ban} 
                            width={24} height={24}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded pointer-events-none shadow-sm" 
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Enemy Bans */}
                <div className="bg-rose-50/50 p-4 rounded-xl border border-rose-100">
                  <h3 className="text-lg font-bold mb-3 text-rose-600">Enemy Bans</h3>
                  <div className="grid grid-cols-5 gap-3">
                    {formData.enemy_bans.map((ban, index) => (
                      <div key={index} className="relative">
                        <input 
                          type="text" 
                          list="all-champions"
                          value={ban} 
                          onChange={(e) => updateBans('enemy', index, e.target.value)} 
                          placeholder={`Ban ${index + 1}`} 
                          className="w-full px-2 py-3 bg-white border border-rose-200 rounded-lg text-sm outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400 transition-all font-medium text-slate-800 placeholder-slate-400" 
                        />
                        {getChampionIcon(ban) && (
                          <Image 
                            src={getChampionIcon(ban)!} 
                            alt={ban} 
                            width={24} height={24}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded pointer-events-none shadow-sm" 
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            
            {/* Player Performance */}
            <section>
                <h2 className="text-3xl font-black mb-8 text-[#0f172a]">Player Performance</h2>

                {/* Our Team */}
                <div className="mb-12">
                  <h3 className="text-xl font-bold mb-4 text-[#0984e3]">Our Team</h3>
                  <div className="overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl border border-blue-200">
                    <table className="w-full bg-white">
                      <thead>
                        <tr className="border-b border-blue-200 bg-blue-50">
                          <th className="p-3 text-left w-16 text-slate-600">Role</th>
                          <th className="p-3 text-left min-w-[120px] text-slate-600">Player</th>
                          <th className="p-3 text-left min-w-[140px] text-slate-600">Champion</th>
                          <th className="p-3 text-center w-12 text-slate-600">K</th>
                          <th className="p-3 text-center w-12 text-slate-600">D</th>
                          <th className="p-3 text-center w-12 text-slate-600">A</th>
                          <th className="p-3 text-center w-14 text-slate-600">CS</th>
                          <th className="p-3 text-center w-14 text-slate-600 bg-emerald-50">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.our_participants.map((p, index) => {
                          const selectedPlayer = players.find(pl => pl.id === p.player_id)
                          return (
                            <tr key={index} className="border-b border-blue-100 hover:bg-blue-50/50">
                              <td className="p-3 font-bold text-[#f1c40f] text-sm">{p.role}</td>
                              <td className="p-3">
                                <select value={p.player_id} onChange={(e) => updateOurParticipant(index, 'player_id', parseInt(e.target.value))} className="w-full bg-white border border-blue-200 rounded px-2 py-1.5 text-sm font-medium text-slate-700 outline-none focus:border-[#0984e3]">
                                  {players.map(player => (
                                    <option key={player.id} value={player.id}>
                                      {player.name} ({player.ign})
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  {p.champion && getChampionIcon(p.champion) && <Image key={p.champion} src={getChampionIcon(p.champion)!} alt="" width={24} height={24} className="w-6 h-6 rounded shadow-sm" />}
                                  <input list="all-champions" type="text" value={p.champion} onChange={(e) => updateOurParticipant(index, 'champion', e.target.value)} onKeyDown={(e) => {
                                    if (e.key === 'Tab') {
                                      const current = e.currentTarget.value.trim();
                                      if (current) {
                                        const match = allChampions.find(c => c.toLowerCase().startsWith(current.toLowerCase()));
                                        if (match && match !== current) {
                                          updateOurParticipant(index, 'champion', match);
                                          e.preventDefault();
                                        }
                                      }
                                    }
                                  }} className="flex-1 bg-white border border-blue-200 rounded px-2 py-1.5 text-sm font-medium text-slate-700 outline-none focus:border-[#0984e3]" placeholder="Champion" />
                                </div>
                              </td>
                              <td className="p-3"><input type="number" min="0" value={p.kills === 0 ? '' : p.kills} onChange={(e) => updateOurParticipant(index, 'kills', parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-white border border-blue-200 rounded py-1.5 text-center text-sm font-medium text-slate-700 outline-none focus:border-[#0984e3] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></td>
                              <td className="p-3"><input type="number" min="0" value={p.deaths === 0 ? '' : p.deaths} onChange={(e) => updateOurParticipant(index, 'deaths', parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-white border border-blue-200 rounded py-1.5 text-center text-sm font-medium text-slate-700 outline-none focus:border-[#0984e3] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></td>
                              <td className="p-3"><input type="number" min="0" value={p.assists === 0 ? '' : p.assists} onChange={(e) => updateOurParticipant(index, 'assists', parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-white border border-blue-200 rounded py-1.5 text-center text-sm font-medium text-slate-700 outline-none focus:border-[#0984e3] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></td>
                              <td className="p-3"><input type="number" min="0" value={p.cs === 0 ? '' : p.cs} onChange={(e) => updateOurParticipant(index, 'cs', parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-white border border-blue-200 rounded py-1.5 text-center text-sm font-medium text-slate-700 outline-none focus:border-[#0984e3] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></td>
                              <td className="p-3 text-center">
                                <span className={`inline-block px-2 py-1 rounded font-bold text-sm ${p.score >= 70 ? 'bg-emerald-100 text-emerald-700' : p.score >= 50 ? 'bg-blue-100 text-blue-700' : p.score >= 30 ? 'bg-yellow-100 text-yellow-700' : 'bg-rose-100 text-rose-700'}`}>
                                  {Math.round(p.score)}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Enemy Team */}
                <div>
                  <h3 className="text-xl font-bold mb-4 text-rose-500">Enemy Team</h3>
                  <div className="overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl border border-rose-200">
                    <table className="w-full bg-white">
                      <thead>
                        <tr className="border-b border-rose-200 bg-rose-50">
                          <th className="p-3 text-left w-16 text-slate-600">Role</th>
                          <th className="p-3 text-left min-w-[140px] text-slate-600">Champion</th>
                          <th className="p-3 text-center w-12 text-slate-600">K</th>
                          <th className="p-3 text-center w-12 text-slate-600">D</th>
                          <th className="p-3 text-center w-12 text-slate-600">A</th>
                          <th className="p-3 text-center w-14 text-slate-600">CS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.enemy_participants.map((p, index) => (
                          <tr key={index} className="border-b border-rose-100 hover:bg-rose-50/50">
                            <td className="p-3 font-bold text-[#f1c40f] text-sm">{p.role}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                {p.champion && getChampionIcon(p.champion) && <Image key={p.champion} src={getChampionIcon(p.champion)!} alt="" width={24} height={24} className="w-6 h-6 rounded shadow-sm" />}
                                <input list="all-champions" type="text" value={p.champion} onChange={(e) => updateEnemyParticipant(index, 'champion', e.target.value)} onKeyDown={(e) => {
                                  if (e.key === 'Tab') {
                                    const current = e.currentTarget.value.trim();
                                    if (current) {
                                      const match = allChampions.find(c => c.toLowerCase().startsWith(current.toLowerCase()));
                                      if (match && match !== current) {
                                        updateEnemyParticipant(index, 'champion', match);
                                        e.preventDefault();
                                      }
                                    }
                                  }
                                }} className="flex-1 bg-white border border-rose-200 rounded px-2 py-1.5 text-sm font-medium text-slate-700 outline-none focus:border-rose-400" placeholder="Champion" />
                              </div>
                            </td>
                            <td className="p-3"><input type="number" min="0" value={p.kills === 0 ? '' : p.kills} onChange={(e) => updateEnemyParticipant(index, 'kills', parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-white border border-rose-200 rounded py-1.5 text-center text-sm font-medium text-slate-700 outline-none focus:border-rose-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></td>
                            <td className="p-3"><input type="number" min="0" value={p.deaths === 0 ? '' : p.deaths} onChange={(e) => updateEnemyParticipant(index, 'deaths', parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-white border border-rose-200 rounded py-1.5 text-center text-sm font-medium text-slate-700 outline-none focus:border-rose-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></td>
                            <td className="p-3"><input type="number" min="0" value={p.assists === 0 ? '' : p.assists} onChange={(e) => updateEnemyParticipant(index, 'assists', parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-white border border-rose-200 rounded py-1.5 text-center text-sm font-medium text-slate-700 outline-none focus:border-rose-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></td>
                            <td className="p-3"><input type="number" min="0" value={p.cs === 0 ? '' : p.cs} onChange={(e) => updateEnemyParticipant(index, 'cs', parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-white border border-rose-200 rounded py-1.5 text-center text-sm font-medium text-slate-700 outline-none focus:border-rose-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </div>

          <datalist id="all-champions">
            {allChampions.map(champ => <option key={champ} value={champ} />)}
          </datalist>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-10 py-4 bg-[#f1c40f] hover:bg-[#f39c12] disabled:bg-slate-300 disabled:text-slate-500 text-slate-900 font-bold text-lg rounded-xl shadow-md transition-all"
          >
            {loading ? 'Adding Match...' : 'Add Match to Database'}
          </button>
        </form>
      )}
    </div>
  </>
  )
}