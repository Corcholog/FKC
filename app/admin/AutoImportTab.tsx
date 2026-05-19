'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Use the existing Player type from AdminForm (could be moved to a types file later)
type Player = {
  id: number
  name: string
  ign: string
  role: string
  puuid: string
}

export default function AutoImportTab({ 
  players, 
  insertMatchToDb 
}: { 
  players: Player[],
  insertMatchToDb: (matchData: any, isManual: boolean) => Promise<void>
}) {
  const [importSummonerName, setImportSummonerName] = useState('')
  const [importCount, setImportCount] = useState(10)
  const [isImporting, setIsImporting] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const [skippedLogs, setSkippedLogs] = useState<{ date: string, players: string[] }[]>([])

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

          const knownAllies = match.our_participants.filter((p: any) => isKnownPlayer(p.puuid));
          const knownAlliesCount = knownAllies.length;

          if (knownAlliesCount >= 4) {
            let isValidMatch = true;

            if (knownAlliesCount === 4) {
              const unknownParticipant = match.our_participants.find((p: any) => !isKnownPlayer(p.puuid));
              const knownPuuids = knownAllies.map((p: any) => p.puuid);
              const missingPlayers = players.filter(p => !knownPuuids.includes(p.puuid));
              
              let missingDbPlayer = missingPlayers.find(p => p.role === unknownParticipant?.role);
              if (!missingDbPlayer && missingPlayers.length === 1) {
                 missingDbPlayer = missingPlayers[0];
              }

              if (unknownParticipant && missingDbPlayer) {
                unknownParticipant.puuid = missingDbPlayer.puuid;
              } else {
                isValidMatch = false;
              }
            }

            if (isValidMatch) {
              await insertMatchToDb(match, false)
              existingDates.add(matchTime) 
              insertedCount++;
              setImportMessage(`✅ Added ${insertedCount} of ${importCount} valid full-stack matches...`)
            } else {
              localSkipped.push({
                date: new Date(match.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                players: match.our_participants.map((p: any) => p.riotId)
              });
            }
          } else {
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
    <section className="bg-card border border-blue-100 dark:border-[#322814] p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <h2 className="text-2xl font-black mb-4 text-[#0984e3]">Fetch & Insert Directly to DB</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">Riot ID (Name#Tag)</label>
          <input type="text" value={importSummonerName} onChange={(e) => setImportSummonerName(e.target.value)} className="w-full p-3 bg-blue-50/50 dark:bg-[#1e2328] border border-blue-200 dark:border-[#322814] rounded-lg focus:border-[#0984e3] focus:ring-1 focus:ring-[#0984e3] outline-none transition-all dark:text-[#f0e6d2]" />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">Target Valid Matches</label>
          <input type="number" value={importCount} onChange={(e) => setImportCount(Number(e.target.value))} min="1" max="50" className="w-full p-3 bg-blue-50/50 dark:bg-[#1e2328] border border-blue-200 dark:border-[#322814] rounded-lg focus:border-[#0984e3] focus:ring-1 focus:ring-[#0984e3] outline-none transition-all dark:text-[#f0e6d2]" />
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
      
      {skippedLogs.length > 0 && (
        <div className="mt-4 border border-blue-200 dark:border-[#322814] bg-card rounded-xl overflow-hidden shadow-sm">
          <div className="bg-blue-50/80 dark:bg-[#091428] p-3 border-b border-blue-100 dark:border-[#322814] flex justify-between items-center">
            <h3 className="font-black text-slate-700 dark:text-slate-200">Skipped Matches ({skippedLogs.length})</h3>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Missing Full Roster</span>
          </div>
          <div className="max-h-60 overflow-y-auto p-4 space-y-3">
            {skippedLogs.map((log, idx) => (
              <div key={idx} className="text-sm border-b border-blue-100 pb-2 last:border-0 last:pb-0">
                <div className="text-slate-500 font-mono font-bold mb-1">{log.date}</div>
                <div className="flex flex-wrap gap-2">
                  {log.players.map((riotId, pIdx) => {
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
  )
}
