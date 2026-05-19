'use client'

import { useState } from 'react'

export default function ImportByIdTab({ 
  formData, 
  setFormData, 
  setActiveTab 
}: { 
  formData: any, 
  setFormData: any, 
  setActiveTab: (tab: any) => void 
}) {
  const [importMatchId, setImportMatchId] = useState('')
  const [importMatchIdRiotId, setImportMatchIdRiotId] = useState('Corshus#2108')
  const [isImporting, setIsImporting] = useState(false)
  const [importMessage, setImportMessage] = useState('')

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

  return (
    <section className="bg-card border border-blue-100 dark:border-[#322814] p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <h2 className="text-2xl font-black mb-4 text-purple-600">Fetch Single Match by ID</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">Target Match ID</label>
          <input type="text" value={importMatchId} onChange={(e) => setImportMatchId(e.target.value)} placeholder="e.g. 1587489137" className="w-full p-3 bg-blue-50/50 border border-blue-200 rounded-lg focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none transition-all" />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">Our Perspective (Riot ID)</label>
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
  )
}
