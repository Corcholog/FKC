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

  const activeDate = dates.find(d => d.id === activeDateId)
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
    setSaving(true)
    const matches = date.groups.flatMap(group => group.matches)
    const groupTeams = date.groups.flatMap(group => group.group_teams)

    const result = await saveDateState(date.id, matches, groupTeams)
    if (!result.success) console.error('Save failed:', result.error)
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
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />

      {/* Hero Section - Cinematic */}
      <section className="relative isolate overflow-hidden border-b border-border bg-gradient-to-b from-background via-popover to-background px-4 py-20 sm:px-8">
        {/* Ambient glow elements */}
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,rgba(var(--accent-rgb),0.15),transparent_50%)]" />
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_bottom_left,rgba(var(--primary-rgb),0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(10,14,19,0.8)_100%)]" />

        <div className="relative mx-auto max-w-[1800px] space-y-8">
          {/* Main Title */}
          <div className="text-center space-y-4">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground font-bold">Tournament Operations System</p>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black uppercase tracking-[0.08em] text-accent">
              LEIF 8
            </h1>
            <p className="text-lg sm:text-xl font-black uppercase tracking-[0.1em] text-foreground">Tournament Circuit</p>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">Manage seeds, brackets, results, and live standings across all stages with esports-grade operations tools.</p>
          </div>

          {/* Date Cards Grid - More compact */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-2xl mx-auto">
            {dates.map(date => (
              <button
                key={date.id}
                onClick={() => setActiveDateId(date.id)}
                className={`rounded-sharp p-2.5 border transition text-xs font-bold uppercase tracking-widest ${
                  activeDateId === date.id
                    ? 'border-accent bg-accent/20 text-accent glow-gold'
                    : 'border-border bg-card text-muted-foreground hover:border-accent hover:bg-popover'
                }`}
              >
                <div>{date.name}</div>
                <div className="text-[0.65rem] text-muted-foreground">{date.is_locked ? '🔒 Locked' : '✎ Open'}</div>
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
                <div className="rounded-sharp border border-border bg-card p-4 shadow-lg shadow-black/40">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-black uppercase tracking-widest text-accent">{activeDate.name}</h2>
                      <p className="mt-1 text-xs text-muted-foreground uppercase tracking-widest">
                        {activeDate.is_locked ? 'FINALIZED · EDITING DISABLED' : 'ACTIVE · EDIT TEAMS & RESULTS'}
                      </p>
                    </div>

                    {/* Control Buttons */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setShowStandings(prev => !prev)}
                        className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-sharp bg-primary/20 border border-primary/40 text-primary transition hover:bg-primary/30 xl:hidden"
                      >
                        {showStandings ? 'Hide' : 'Show'}
                      </button>

                      <button
                        onClick={() => handleSave(activeDate)}
                        disabled={!isAuthenticated || activeDate.is_locked || saving}
                        className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-sharp bg-primary text-primary-foreground transition hover:bg-primary/80 disabled:opacity-40"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>

                      <button
                        onClick={() => resetDate(activeDate.id)}
                        disabled={activeDate.is_locked}
                        className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-sharp bg-destructive text-destructive-foreground transition hover:bg-destructive/80 disabled:opacity-40"
                      >
                        Reset
                      </button>

                      {activeDate.is_locked ? (
                        <button
                          onClick={() => handleUnlockAndReset(activeDate.id)}
                          disabled={!isAuthenticated || locking}
                          className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-sharp bg-destructive text-destructive-foreground transition hover:bg-destructive/80 disabled:opacity-40"
                        >
                          Unlock & Reset
                        </button>
                      ) : (
                        <button
                          onClick={() => handleLock(activeDate.id)}
                          disabled={!isAuthenticated || locking}
                          className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-sharp bg-accent text-accent-foreground transition hover:bg-accent/80 disabled:opacity-40"
                        >
                          {locking ? 'Locking...' : 'Lock'}
                        </button>
                      )}
                      {!isAuthenticated && (
                        <div className="w-full text-[0.65rem] text-muted-foreground mt-1">
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
                            locked={activeDate.is_locked}
                            onChange={updateGroup}
                          />
                        ) : (
                          <MiniBracket
                            key={group.id}
                            group={group}
                            teams={allTeams}
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
              <div className="sticky top-6 rounded-sharp border border-[#2a3544] bg-[#11161d] p-4 shadow-2xl shadow-black/40">
                <GlobalStandings standings={standings} />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
