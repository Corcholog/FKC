'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/app/components/Navbar'
import ScoutingAdmin from './ScoutingAdmin'
import AutoImportTab from './AutoImportTab'
import ImportByIdTab from './ImportByIdTab'
import ManualEntryTab from './ManualEntryTab'
import { insertMatchToDb } from '@/app/actions/match'

import type { Player, FormData } from './types'

const roles = ['top', 'jungle', 'mid', 'adc', 'support']

export default function AdminForm({ players }: { players: Player[] }) {
  const now = new Date().toISOString().slice(0, 16)
  const [activeTab, setActiveTab] = useState<'auto' | 'import-id' | 'manual' | 'scouting'>('auto')
  const [isUpdatingSoloQ, setIsUpdatingSoloQ] = useState(false)
  const [isInitRanks, setIsInitRanks] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [importMessage, setImportMessage] = useState('')

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

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      await insertMatchToDb(formData, true, players)
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

  const handleUpdateSoloQ = async () => {
    setIsUpdatingSoloQ(true);
    setImportMessage('Updating SoloQ stats for all players. This may take a while...');
    try {
      const res = await fetch('/api/import-soloq', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Unknown error');
      setImportMessage(`✅ SoloQ Update Complete! Added ${result.addedCount} new matches.`);
    } catch (err: any) {
      setImportMessage(`❌ SoloQ Update Failed: ${err.message}`);
    } finally {
      setIsUpdatingSoloQ(false);
    }
  }

  const handleInitRanks = async () => {
    setIsInitRanks(true);
    setImportMessage('Initializing SoloQ Ranks for all players...');
    try {
      const res = await fetch('/api/init-ranks', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Unknown error');
      setImportMessage(`✅ Ranks Initialized! Updated ${result.updatedCount} players.`);
    } catch (err: any) {
      setImportMessage(`❌ Init Ranks Failed: ${err.message}`);
    } finally {
      setIsInitRanks(false);
    }
  }

  return (
    <>
      <Navbar />
      <div className="w-full max-w-6xl mx-auto px-8 pt-24 pb-8 text-foreground">
        {/* Header and Logout */}
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-4xl font-black text-foreground">Match Admin</h1>
          <button onClick={handleLogout} className="px-6 py-2 bg-rose-500 text-white font-bold rounded-lg shadow-sm hover:bg-rose-600 transition-all">Logout</button>
        </div>

        {/* Global Notifications */}
        {(importMessage || message) && (
          <div className="mb-6">
            {importMessage && (
              <div className={`p-4 rounded-lg font-bold border shadow-sm mb-2 ${importMessage.includes('❌') ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
                {importMessage}
              </div>
            )}
            {message && (
              <div className={`p-4 rounded-lg font-bold border shadow-sm mb-2 ${message.includes('❌') ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
                {message}
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex justify-between items-center mb-8 border-b border-blue-200 dark:border-[#322814] pb-4">
          <div className="flex gap-4">
            <button 
              onClick={() => setActiveTab('auto')}
              className={`px-6 py-3 rounded-lg font-bold transition-all shadow-sm ${activeTab === 'auto' ? 'bg-[#0984e3] text-white shadow-md' : 'bg-card border border-blue-100 dark:border-[#322814] text-slate-500 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-[#1e2328]'}`}
            >
              Auto Import (Flex)
            </button>
            <button 
              onClick={() => setActiveTab('import-id')}
              className={`px-6 py-3 rounded-lg font-bold transition-all shadow-sm ${activeTab === 'import-id' ? 'bg-purple-600 text-white shadow-md' : 'bg-card border border-blue-100 dark:border-[#322814] text-slate-500 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-[#1e2328]'}`}
            >
              Import by ID
            </button>
            <button 
              onClick={() => setActiveTab('manual')}
              className={`px-6 py-3 rounded-lg font-bold transition-all shadow-sm ${activeTab === 'manual' ? 'bg-[#f1c40f] text-slate-900 border border-yellow-500 shadow-md' : 'bg-card border border-blue-100 dark:border-[#322814] text-slate-500 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-[#1e2328]'}`}
            >
              Manual Input
            </button>
            <button 
              onClick={() => setActiveTab('scouting')}
              className={`px-6 py-3 rounded-lg font-bold transition-all shadow-sm ${activeTab === 'scouting' ? 'bg-emerald-500 text-white shadow-md' : 'bg-card border border-blue-100 dark:border-[#322814] text-slate-500 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-[#1e2328]'}`}
            >
              Tournament Scouting
            </button>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={handleUpdateSoloQ}
              disabled={isUpdatingSoloQ || isInitRanks}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 border border-blue-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all shadow-sm"
            >
              {isUpdatingSoloQ ? 'Updating...' : 'Update SoloQ'}
            </button>
            <button 
              onClick={handleInitRanks}
              disabled={isUpdatingSoloQ || isInitRanks}
              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 border border-purple-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all shadow-sm"
            >
              {isInitRanks ? 'Initializing...' : 'Initialize Ranks'}
            </button>
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
        </div>

        {/* Tab Content Rendering */}
        {activeTab === 'scouting' && <ScoutingAdmin players={players} />}
        {activeTab === 'auto' && <AutoImportTab players={players} insertMatchToDb={(data, isManual) => insertMatchToDb(data, isManual, players)} />}
        {activeTab === 'import-id' && <ImportByIdTab formData={formData} setFormData={setFormData} setActiveTab={setActiveTab} />}
        {activeTab === 'manual' && (
          <ManualEntryTab 
            formData={formData} 
            loading={loading} 
            players={players} 
            handleManualSubmit={handleManualSubmit} 
            updateFormData={updateFormData} 
            updateBans={updateBans} 
            updateOurParticipant={updateOurParticipant} 
            updateEnemyParticipant={updateEnemyParticipant} 
          />
        )}
      </div>
    </>
  )
}