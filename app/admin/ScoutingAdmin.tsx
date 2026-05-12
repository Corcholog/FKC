'use client'
import { useState, useEffect } from 'react'

export default function ScoutingAdmin() {
  const [teams, setTeams] = useState<any[]>([])
  const [newTeamName, setNewTeamName] = useState('')
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null)
  const [newPlayerIgn, setNewPlayerIgn] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    fetchTeams()
  }, [])

  const fetchTeams = async () => {
    try {
      const res = await fetch('/api/tournament/teams')
      const data = await res.json()
      if (data.success) {
        setTeams(data.teams || [])
      }
    } catch (error) {
      console.error('Error fetching teams:', error)
    }
  }

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTeamName.trim()) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/tournament/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName })
      })
      const data = await res.json()
      if (data.success) {
        setNewTeamName('')
        fetchTeams()
        setMessage('✅ Team added successfully!')
      } else {
        setMessage(`❌ Error: ${data.error}`)
      }
    } catch (err: any) {
      setMessage(`❌ Error: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteTeam = async (id: number) => {
    if (!confirm('Are you sure you want to delete this team?')) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/tournament/teams', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      if (res.ok) {
        if (selectedTeam === id) setSelectedTeam(null)
        fetchTeams()
        setMessage('✅ Team deleted.')
      }
    } catch (err: any) {
      setMessage(`❌ Error: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTeam || !newPlayerIgn.trim()) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/tournament/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: selectedTeam, ign: newPlayerIgn })
      })
      const data = await res.json()
      if (data.success) {
        setNewPlayerIgn('')
        fetchTeams()
        setMessage('✅ Player added successfully!')
      } else {
        setMessage(`❌ Error: ${data.error}`)
      }
    } catch (err: any) {
      setMessage(`❌ Error: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeletePlayer = async (id: number) => {
    if (!confirm('Delete player?')) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/tournament/players', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      if (res.ok) {
        fetchTeams()
      }
    } catch (err: any) {
      setMessage(`❌ Error: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    setMessage('Syncing stats from Riot API. This might take a few minutes...')
    try {
      const res = await fetch('/api/tournament/sync', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setMessage(`✅ Synced! Updated ${data.updatedCount} players.`)
        fetchTeams()
      } else {
        setMessage(`❌ Sync Error: ${data.error}`)
      }
    } catch (err: any) {
      setMessage(`❌ Sync Error: ${err.message}`)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <section className="bg-card border border-blue-100 dark:border-[#322814] p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-black text-emerald-600">Tournament Scouting Setup</h2>
        <button 
          onClick={handleSync} 
          disabled={isSyncing || isLoading}
          className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold rounded-lg shadow-sm transition-all"
        >
          {isSyncing ? 'Syncing...' : 'Sync Ranks from Riot'}
        </button>
      </div>

      {message && (
        <div className={`mb-6 p-3 rounded-lg font-bold border ${message.includes('❌') ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Teams List */}
        <div className="col-span-1 border border-blue-200 dark:border-[#322814] rounded-xl overflow-hidden bg-card">
          <div className="p-4 bg-blue-50/50 dark:bg-[#1e2328]">
            <h3 className="font-bold text-slate-700 dark:text-[#f0e6d2] mb-3">Teams</h3>
            <form onSubmit={handleAddTeam} className="flex gap-2">
              <input 
                type="text" 
                value={newTeamName} 
                onChange={e => setNewTeamName(e.target.value)} 
                placeholder="New Team Name" 
                className="flex-1 px-3 py-2 text-sm rounded bg-white dark:bg-[#091428] border border-blue-200 dark:border-[#322814] outline-none text-slate-800 dark:text-[#f0e6d2]"
              />
              <button disabled={isLoading} className="px-3 py-2 bg-[#0984e3] text-white text-sm font-bold rounded hover:bg-blue-600 transition-colors">Add</button>
            </form>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {teams.length === 0 ? (
              <p className="p-4 text-sm text-slate-500 text-center">No teams yet.</p>
            ) : (
              <ul className="divide-y divide-blue-100 dark:divide-[#322814]">
                {teams.map(team => (
                  <li 
                    key={team.id} 
                    className={`p-3 flex justify-between items-center cursor-pointer transition-colors ${selectedTeam === team.id ? 'bg-blue-100 dark:bg-[#1e2328]' : 'hover:bg-blue-50/50 dark:hover:bg-[#1e2328]/50'}`}
                    onClick={() => setSelectedTeam(team.id)}
                  >
                    <span className="font-bold text-slate-700 dark:text-[#f0e6d2] text-sm">{team.name} ({team.tournament_players?.length || 0})</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteTeam(team.id) }} 
                      className="text-rose-500 hover:bg-rose-100 p-1 rounded transition-colors text-xs font-bold"
                    >
                      Del
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Players List */}
        <div className="col-span-1 md:col-span-2 border border-blue-200 dark:border-[#322814] rounded-xl overflow-hidden bg-card">
          {selectedTeam ? (
            <>
              <div className="p-4 bg-purple-50/50 dark:bg-[#1e2328]">
                <h3 className="font-bold text-slate-700 dark:text-[#f0e6d2] mb-3">
                  Players in: <span className="text-purple-600">{teams.find(t => t.id === selectedTeam)?.name}</span>
                </h3>
                <form onSubmit={handleAddPlayer} className="flex gap-2">
                  <input 
                    type="text" 
                    value={newPlayerIgn} 
                    onChange={e => setNewPlayerIgn(e.target.value)} 
                    placeholder="Riot IGN (Name#Tag)" 
                    className="flex-1 px-3 py-2 text-sm rounded bg-white dark:bg-[#091428] border border-blue-200 dark:border-[#322814] outline-none text-slate-800 dark:text-[#f0e6d2]"
                  />
                  <button disabled={isLoading} className="px-3 py-2 bg-purple-600 text-white text-sm font-bold rounded hover:bg-purple-700 transition-colors">Add Player</button>
                </form>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {teams.find(t => t.id === selectedTeam)?.tournament_players?.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500 text-center">No players in this team.</p>
                ) : (
                  <ul className="divide-y divide-blue-100 dark:divide-[#322814]">
                    {teams.find(t => t.id === selectedTeam)?.tournament_players?.map((player: any) => (
                      <li key={player.id} className="p-3 flex justify-between items-center hover:bg-blue-50/50 dark:hover:bg-[#1e2328]/50">
                        <div>
                          <div className="font-bold text-slate-700 dark:text-[#f0e6d2] text-sm">{player.ign}</div>
                          <div className="text-xs text-slate-500 flex gap-3 mt-1">
                            {player.soloq_tier ? (
                              <span className="text-[#0984e3]">SoloQ: {player.soloq_tier} {player.soloq_rank} ({player.soloq_lp}LP)</span>
                            ) : <span>SoloQ: Unranked</span>}
                            {player.flexq_tier ? (
                              <span className="text-purple-500">FlexQ: {player.flexq_tier} {player.flexq_rank} ({player.flexq_lp}LP)</span>
                            ) : <span>FlexQ: Unranked</span>}
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDeletePlayer(player.id)} 
                          className="text-rose-500 hover:bg-rose-100 p-1.5 rounded transition-colors text-xs font-bold"
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center p-8 text-slate-500 text-sm font-medium">
              Select a team on the left to manage its players.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
