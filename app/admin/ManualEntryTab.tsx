'use client'

import Image from 'next/image'
import { allChampions, getChampionIcon } from '@/lib/champions'

export default function ManualEntryTab({
  formData,
  loading,
  players,
  handleManualSubmit,
  updateFormData,
  updateBans,
  updateOurParticipant,
  updateEnemyParticipant
}: {
  formData: any;
  loading: boolean;
  players: any[];
  handleManualSubmit: (e: React.FormEvent) => Promise<void>;
  updateFormData: (key: string, value: any) => void;
  updateBans: (team: 'our' | 'enemy', index: number, value: string) => void;
  updateOurParticipant: (index: number, field: string, value: any) => void;
  updateEnemyParticipant: (index: number, field: string, value: any) => void;
}) {
  return (
    <form onSubmit={handleManualSubmit}>
      <div className="space-y-12">
        {/* Match Information */}
        <section>
          <h2 className="text-2xl font-black mb-4 text-foreground">Match Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">Date & Time</label>
              <input 
                type="datetime-local" 
                value={formData.date} 
                onChange={(e) => updateFormData('date', e.target.value)} 
                className="w-full p-3 bg-card border border-blue-200 dark:border-[#322814] rounded-lg outline-none focus:border-[#0984e3] focus:ring-1 focus:ring-[#0984e3] transition-all dark:text-[#f0e6d2]" 
                required 
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">Match Type</label>
              <input 
                type="text" 
                value={formData.match_type} 
                onChange={(e) => updateFormData('match_type', e.target.value.toLowerCase().replace(/\s+/g, '_'))} 
                list="match-type-suggestions"
                className="w-full p-3 bg-card border border-blue-200 dark:border-[#322814] rounded-lg outline-none focus:border-[#0984e3] focus:ring-1 focus:ring-[#0984e3] transition-all dark:text-[#f0e6d2]"
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
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">Our Side</label>
              <div className="flex gap-6 font-medium text-slate-700 dark:text-slate-300">
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
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">We Won</label>
              <input type="checkbox" checked={formData.we_won} onChange={(e) => updateFormData('we_won', e.target.checked)} className="w-5 h-5 accent-emerald-500 cursor-pointer rounded" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">Duration</label>
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
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">Enemy Team Name</label>
              <input type="text" value={formData.enemy_team_name} onChange={(e) => updateFormData('enemy_team_name', e.target.value)} className="w-full p-3 bg-card border border-blue-200 dark:border-[#322814] rounded-lg outline-none focus:border-[#0984e3] focus:ring-1 focus:ring-[#0984e3] transition-all dark:text-[#f0e6d2]" />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">Notes</label>
            <textarea value={formData.notes} onChange={(e) => updateFormData('notes', e.target.value)} className="w-full p-3 bg-card border border-blue-200 dark:border-[#322814] rounded-lg outline-none focus:border-[#0984e3] focus:ring-1 focus:ring-[#0984e3] transition-all dark:text-[#f0e6d2]" rows={3} />
          </div>
        </section>
        
        {/* Bans Section */}
        <section className="bg-card p-6 rounded-2xl border border-blue-100 dark:border-[#322814] shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <h2 className="text-2xl font-black mb-6 text-foreground">Bans</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-emerald-50/50 dark:bg-emerald-900/10 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800">
              <h3 className="text-lg font-bold mb-3 text-emerald-600">Our Bans</h3>
              <div className="grid grid-cols-5 gap-3">
                {formData.our_bans.map((ban: string, index: number) => (
                  <div key={index} className="relative">
                    <input 
                      type="text" 
                      list="all-champions"
                      value={ban} 
                      onChange={(e) => updateBans('our', index, e.target.value)} 
                      placeholder={`Ban ${index + 1}`} 
                      className="w-full px-2 py-3 bg-card border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-all font-medium text-slate-800 dark:text-[#f0e6d2] placeholder-slate-400" 
                    />
                    {getChampionIcon(ban) && (
                      <Image src={getChampionIcon(ban)!} alt={ban} width={24} height={24} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded pointer-events-none shadow-sm" />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-rose-50/50 dark:bg-rose-900/10 p-4 rounded-xl border border-rose-100 dark:border-rose-900">
              <h3 className="text-lg font-bold mb-3 text-rose-600">Enemy Bans</h3>
              <div className="grid grid-cols-5 gap-3">
                {formData.enemy_bans.map((ban: string, index: number) => (
                  <div key={index} className="relative">
                    <input 
                      type="text" 
                      list="all-champions"
                      value={ban} 
                      onChange={(e) => updateBans('enemy', index, e.target.value)} 
                      placeholder={`Ban ${index + 1}`} 
                      className="w-full px-2 py-3 bg-card border border-rose-200 dark:border-rose-900 rounded-lg text-sm outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400 transition-all font-medium text-slate-800 dark:text-[#f0e6d2] placeholder-slate-400" 
                    />
                    {getChampionIcon(ban) && (
                      <Image src={getChampionIcon(ban)!} alt={ban} width={24} height={24} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded pointer-events-none shadow-sm" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        
        {/* Player Performance */}
        <section>
          <h2 className="text-3xl font-black mb-8 text-foreground">Player Performance</h2>

          {/* Our Team */}
          <div className="mb-12">
            <h3 className="text-xl font-bold mb-4 text-[#0984e3]">Our Team</h3>
            <div className="overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl border border-blue-200">
              <table className="w-full bg-card">
                <thead>
                  <tr className="border-b border-blue-200 dark:border-[#322814] bg-blue-50 dark:bg-[#091428]">
                    <th className="p-3 text-left w-16 text-slate-600 dark:text-slate-300">Role</th>
                    <th className="p-3 text-left min-w-[120px] text-slate-600 dark:text-slate-300">Player</th>
                    <th className="p-3 text-left min-w-[140px] text-slate-600 dark:text-slate-300">Champion</th>
                    <th className="p-3 text-center w-12 text-slate-600 dark:text-slate-300">K</th>
                    <th className="p-3 text-center w-12 text-slate-600 dark:text-slate-300">D</th>
                    <th className="p-3 text-center w-12 text-slate-600 dark:text-slate-300">A</th>
                    <th className="p-3 text-center w-14 text-slate-600 dark:text-slate-300">CS</th>
                    <th className="p-3 text-center w-14 text-slate-600 dark:text-slate-300 bg-emerald-50 dark:bg-emerald-900/20">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.our_participants.map((p: any, index: number) => {
                    return (
                      <tr key={index} className="border-b border-blue-100 dark:border-[#322814] hover:bg-blue-50/50 dark:hover:bg-[#1e2328]/50">
                        <td className="p-3 font-bold text-[#f1c40f] text-sm">{p.role}</td>
                        <td className="p-3">
                          <select value={p.player_id} onChange={(e) => updateOurParticipant(index, 'player_id', parseInt(e.target.value))} className="w-full bg-card border border-blue-200 dark:border-[#322814] rounded px-2 py-1.5 text-sm font-medium text-slate-700 dark:text-[#f0e6d2] outline-none focus:border-[#0984e3]">
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
                            }} className="flex-1 bg-card border border-blue-200 dark:border-[#322814] rounded px-2 py-1.5 text-sm font-medium text-slate-700 dark:text-[#f0e6d2] outline-none focus:border-[#0984e3]" placeholder="Champion" />
                          </div>
                        </td>
                        <td className="p-3"><input type="number" min="0" value={p.kills === 0 ? '' : p.kills} onChange={(e) => updateOurParticipant(index, 'kills', parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-card border border-blue-200 dark:border-[#322814] rounded py-1.5 text-center text-sm font-medium text-slate-700 dark:text-[#f0e6d2] outline-none focus:border-[#0984e3] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></td>
                        <td className="p-3"><input type="number" min="0" value={p.deaths === 0 ? '' : p.deaths} onChange={(e) => updateOurParticipant(index, 'deaths', parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-card border border-blue-200 dark:border-[#322814] rounded py-1.5 text-center text-sm font-medium text-slate-700 dark:text-[#f0e6d2] outline-none focus:border-[#0984e3] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></td>
                        <td className="p-3"><input type="number" min="0" value={p.assists === 0 ? '' : p.assists} onChange={(e) => updateOurParticipant(index, 'assists', parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-card border border-blue-200 dark:border-[#322814] rounded py-1.5 text-center text-sm font-medium text-slate-700 dark:text-[#f0e6d2] outline-none focus:border-[#0984e3] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></td>
                        <td className="p-3"><input type="number" min="0" value={p.cs === 0 ? '' : p.cs} onChange={(e) => updateOurParticipant(index, 'cs', parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-card border border-blue-200 dark:border-[#322814] rounded py-1.5 text-center text-sm font-medium text-slate-700 dark:text-[#f0e6d2] outline-none focus:border-[#0984e3] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></td>
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
              <table className="w-full bg-card">
                <thead>
                  <tr className="border-b border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-900/10">
                    <th className="p-3 text-left w-16 text-slate-600 dark:text-slate-300">Role</th>
                    <th className="p-3 text-left min-w-[140px] text-slate-600 dark:text-slate-300">Champion</th>
                    <th className="p-3 text-center w-12 text-slate-600 dark:text-slate-300">K</th>
                    <th className="p-3 text-center w-12 text-slate-600 dark:text-slate-300">D</th>
                    <th className="p-3 text-center w-12 text-slate-600 dark:text-slate-300">A</th>
                    <th className="p-3 text-center w-14 text-slate-600 dark:text-slate-300">CS</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.enemy_participants.map((p: any, index: number) => (
                    <tr key={index} className="border-b border-rose-100 dark:border-rose-900/50 hover:bg-rose-50/50 dark:hover:bg-rose-900/10">
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
                          }} className="flex-1 bg-card border border-rose-200 dark:border-rose-900 rounded px-2 py-1.5 text-sm font-medium text-slate-700 dark:text-[#f0e6d2] outline-none focus:border-rose-400" placeholder="Champion" />
                        </div>
                      </td>
                      <td className="p-3"><input type="number" min="0" value={p.kills === 0 ? '' : p.kills} onChange={(e) => updateEnemyParticipant(index, 'kills', parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-card border border-rose-200 dark:border-rose-900 rounded py-1.5 text-center text-sm font-medium text-slate-700 dark:text-[#f0e6d2] outline-none focus:border-rose-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></td>
                      <td className="p-3"><input type="number" min="0" value={p.deaths === 0 ? '' : p.deaths} onChange={(e) => updateEnemyParticipant(index, 'deaths', parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-card border border-rose-200 dark:border-rose-900 rounded py-1.5 text-center text-sm font-medium text-slate-700 dark:text-[#f0e6d2] outline-none focus:border-rose-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></td>
                      <td className="p-3"><input type="number" min="0" value={p.assists === 0 ? '' : p.assists} onChange={(e) => updateEnemyParticipant(index, 'assists', parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-card border border-rose-200 dark:border-rose-900 rounded py-1.5 text-center text-sm font-medium text-slate-700 dark:text-[#f0e6d2] outline-none focus:border-rose-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></td>
                      <td className="p-3"><input type="number" min="0" value={p.cs === 0 ? '' : p.cs} onChange={(e) => updateEnemyParticipant(index, 'cs', parseInt(e.target.value) || 0)} placeholder="0" className="w-full bg-card border border-rose-200 dark:border-rose-900 rounded py-1.5 text-center text-sm font-medium text-slate-700 dark:text-[#f0e6d2] outline-none focus:border-rose-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></td>
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
  )
}
