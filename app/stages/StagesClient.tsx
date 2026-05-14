'use client'

import { useMemo, useState } from 'react'
import Navbar from '@/app/components/Navbar'
import {
  DbDate,
  DbGroup,
  Team,
  calculateGlobalStandings,
  normalizeDateState,
  normalizeGroupState
} from '@/lib/tournamentData'

import MiniBracket from './components/MiniBracket'
import GlobalStandings from './components/GlobalStandings'
import PlayoffBracket from './components/PlayoffBracket'

import { saveDateState, lockDate, unlockDate } from './actions'

interface Props {
  initialDates: DbDate[]
  teams: Team[]
  isAuthenticated: boolean
}

export default function StagesClient({
  initialDates,
  teams,
  isAuthenticated
}: Props) {

  const [dates, setDates] = useState<DbDate[]>(() =>
    initialDates.map(normalizeDateState)
  )

  const [activeDateId, setActiveDateId] =
    useState(initialDates?.[0]?.id || '')

  const [showStandings, setShowStandings] = useState(false)
  const [saving, setSaving] = useState(false)
  const [locking, setLocking] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const allTeams = useMemo(() => {
    const missing = 16 - teams.length

    const placeholders: Team[] = Array.from({
      length: Math.max(0, missing)
    }).map((_, i) => ({
      id: `TBD_${i + 1}`,
      name: `TBD ${i + 1}`,
      tag: 'TBD'
    }))

    return [...teams, ...placeholders]
  }, [teams])

  const stageDates: Record<number, string> = {
    1: '16/05',
    2: '30/05',
    3: '13/06',
    4: '27/06'
  }

  const activeDate = dates.find(d => d.id === activeDateId)
  const assignedTeamIds = useMemo(
    () =>
      activeDate
        ? activeDate.groups.flatMap(group =>
            group.group_teams
              .map(team => team.team_id)
              .filter(Boolean) as string[]
          )
        : [],
    [activeDate]
  )

  const standings = useMemo(
    () => calculateGlobalStandings(dates, allTeams),
    [dates, allTeams]
  )

  function updateGroup(updatedGroup: DbGroup) {
    setDates(prev =>
      prev.map(date => ({
        ...date,
        groups: date.groups.map(group =>
          group.id === updatedGroup.id ? updatedGroup : group
        )
      }))
    )
  }

  async function handleSave(date: DbDate) {
    if (!isAuthenticated) return
    setSaveError(null)
    setSaving(true)
    const matches = date.groups.flatMap(group => group.matches)
    const groupTeams = date.groups.flatMap(group => group.group_teams)

    const result = await saveDateState(date.id, matches, groupTeams)
    if (!result.success) {
      console.error('Save failed:', result.error)
      setSaveError(result.error || 'Unable to save stage data.')
    }
    setSaving(false)
  }

  async function handleLock(dateId: string) {
    if (!isAuthenticated) return
    setLocking(true)
    const result = await lockDate(dateId)
    if (result.success) {
      setDates(prev =>
        prev.map(date =>
          date.id === dateId ? { ...date, is_locked: true } : date
        )
      )
    } else {
      console.error('Lock failed:', result.error)
    }
    setLocking(false)
  }

  async function handleUnlockAndReset(dateId: string) {
    if (!isAuthenticated) return
    setLocking(true)
    const result = await unlockDate(dateId)
    if (result.success) {
      setDates(prev =>
        prev.map(date => {
          if (date.id !== dateId) return date

          return {
            ...date,
            is_locked: false,
            groups: date.groups.map(group =>
              normalizeGroupState({
                ...group,
                group_teams: [],
                matches: group.matches.map(match => ({
                  ...match,
                  team_a_id: null,
                  team_b_id: null,
                  score_a: null,
                  score_b: null,
                  status: 'Scheduled'
                }))
              })
            )
          }
        })
      )
    } else {
      console.error('Unlock failed:', result.error)
    }
    setLocking(false)
  }

  function resetDate(dateId: string) {
    setDates(prev =>
      prev.map(date => {
        if (date.id !== dateId) return date

        return normalizeDateState({
          ...date,
          groups: date.groups.map(group =>
            normalizeGroupState({
              ...group,
              group_teams: [],
              matches: group.matches.map(match => ({
                ...match,
                team_a_id: null,
                team_b_id: null,
                score_a: null,
                score_b: null,
                status: 'Scheduled'
              }))
            })
          )
        })
      })
    )
  }

  return (
    <main className="min-h-screen bg-[#120000] text-white">
      <Navbar />

      {/* Hero Section - Cinematic */}
      <section className="relative isolate overflow-hidden border-b border-[#3BD7A8] bg-[#080808] px-4 py-20 sm:px-8 text-white">
        {/* Ambient glow elements */}
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,rgba(59,215,168,0.2),transparent_50%)]" />
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_bottom_left,rgba(249,14,0,0.12),transparent_50%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(8,8,8,0.92)_100%)]" />

        <div className="relative mx-auto max-w-[1800px] space-y-8">
          {/* Main Title */}
          <div className="text-center space-y-6">
            <div className="mx-auto flex h-64 w-64 items-center justify-center overflow-hidden rounded-xl border border-[#3BD7A8] bg-white p-2">
              <img src="/icons/leif.jpg" alt="LEIF" className="h-full w-full object-cover" />
            </div>
            <p className="text-3xl sm:text-4xl font-black uppercase tracking-[0.08em] text-[#3BD7A8]">
              LIGA E-SPORTS INTER-FACULTADES
            </p>
            <p className="text-xl uppercase tracking-[0.3em] text-[#F90E00] font-bold">Tournament Operations System</p>
            <p className="text-sm text-[#FFFFFF]/70 max-w-2xl mx-auto">Manage seeds, brackets, results, and live standings across all stages with esports-grade operations tools.</p>
          </div>

          {/* Date Cards Grid - More compact */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-4xl mx-auto">
            {dates.map(date => (
              <button
                key={date.id}
                onClick={() => setActiveDateId(date.id)}
                className={`rounded-sharp p-2.5 border transition text-xs font-bold uppercase tracking-widest ${
                  activeDateId === date.id
                    ? 'border-[#3BD7A8] bg-[#3BD7A8]/10 text-[#3BD7A8] shadow-[0_0_16px_rgba(59,215,168,0.24)]'
                    : 'border-[#3E3E3E] bg-[#111111] text-white hover:border-[#3BD7A8] hover:bg-[#111111]/90'
                }`}
              >
                <div>{date.name}</div>
                <div className="text-[0.65rem] text-[#FFFFFF]/70">
                  {stageDates[date.sequence_order] ?? 'TBD'} · {date.is_locked ? '🔒 Locked' : '✎ Open'}
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="mx-auto max-w-[1800px] px-4 py-10 sm:px-8">
        <div className="flex flex-col gap-8 xl:flex-row">
          {/* Main Bracket Section */}
          <div className="flex-1 space-y-6">
            {activeDate && (
              <div className="space-y-6">
                {/* Date Header and Controls */}
                <div className="rounded-sharp border border-[#3BD7A8] bg-[#080808] p-4 shadow-lg shadow-[#3BD7A8]/10">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-black uppercase tracking-widest text-[#3BD7A8]">{activeDate.name}</h2>
                      <p className="mt-1 text-xs uppercase tracking-widest text-[#FFFFFF]/80">
                        {activeDate.is_locked ? 'FINALIZED · EDITING DISABLED' : 'ACTIVE · EDIT TEAMS & RESULTS'}
                      </p>
                    </div>

                    {/* Control Buttons */}
                    <div className="flex flex-wrap gap-2">
                            <button
                        onClick={() => setShowStandings(prev => !prev)}
                        className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-sharp bg-[#3BD7A8]/12 border border-[#3BD7A8]/40 text-[#3BD7A8] transition hover:bg-[#3BD7A8]/20 xl:hidden"
                      >
                        {showStandings ? 'Hide' : 'Show'}
                      </button>

                      <button
                        onClick={() => handleSave(activeDate)}
                        disabled={!isAuthenticated || activeDate.is_locked || saving}
                        className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-sharp bg-[#3BD7A8] text-[#080808] transition hover:bg-[#2fc499] disabled:opacity-40"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      {saveError && (
                        <div className="w-full text-xs text-[#F90E00] mt-2">
                          {saveError}
                        </div>
                      )}

                      {activeDate.is_locked ? (
                        <button
                          onClick={() => handleUnlockAndReset(activeDate.id)}
                          disabled={!isAuthenticated || locking}
                          className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-sharp bg-[#F90E00] text-[#080808] transition hover:bg-[#e10500] disabled:opacity-40"
                        >
                          Unlock & Reset
                        </button>
                      ) : (
                        <button
                          onClick={() => handleLock(activeDate.id)}
                          disabled={!isAuthenticated || locking}
                          className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-sharp bg-[#3BD7A8] text-[#080808] transition hover:bg-[#2fc499] disabled:opacity-40"
                        >
                          {locking ? 'Locking...' : 'Lock'}
                        </button>
                      )}
                      {!isAuthenticated && (
                        <div className="w-full text-[0.65rem] text-[#FFFFFF]/70 mt-1">
                          Log in to save or lock results.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Brackets Grid */}
                {(() => {
                  const isPlayoffs = activeDate.name.toLowerCase().includes('playoff')
                  return (
                    <div className={`grid gap-8 ${isPlayoffs ? 'xl:grid-cols-1' : 'xl:grid-cols-2'} auto-rows-max`}>
                      {activeDate.groups.map(group => {
                        return isPlayoffs ? (
                          <PlayoffBracket
                            key={group.id}
                            group={group}
                            teams={allTeams}
                            assignedTeamIds={assignedTeamIds}
                            locked={activeDate.is_locked}
                            onChange={updateGroup}
                          />
                        ) : (
                          <MiniBracket
                            key={group.id}
                            group={group}
                            teams={allTeams}
                            assignedTeamIds={assignedTeamIds}
                            locked={activeDate.is_locked}
                            onChange={updateGroup}
                          />
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>

          {/* Sidebar - Standings */}
          <aside className="xl:w-80 xl:flex-shrink-0">
            <div className={`${showStandings ? 'block' : 'hidden'} xl:block`}>
              <div className="sticky top-6 rounded-sharp border border-[#3BD7A8] bg-[#080808] p-4 shadow-2xl shadow-[#3BD7A8]/10">
                <GlobalStandings standings={standings} />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
