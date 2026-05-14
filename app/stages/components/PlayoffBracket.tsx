'use client'

import {
  DbGroup,
  DbMatch,
  Team,
  ensureGroupSlots,
  normalizeGroupState,
  getMatchStatusFromScores,
  getRequiredWins
} from '@/lib/tournamentData'
import MatchNode from './MatchNode'
import BracketConnector from '@/app/components/BracketConnector'

interface Props {
  group: DbGroup
  teams: Team[]
  assignedTeamIds: string[]
  locked: boolean
  onChange: (group: DbGroup) => void
}

export default function PlayoffBracket({
  group,
  teams,
  assignedTeamIds,
  locked,
  onChange
}: Props) {
  const normalizedGroup = normalizeGroupState(group)
  const slots = ensureGroupSlots(normalizedGroup)

  const semi1 = normalizedGroup.matches.find(m => m.stage === 'Playoff_Semi_1')
  const semi2 = normalizedGroup.matches.find(m => m.stage === 'Playoff_Semi_2')
  const final = normalizedGroup.matches.find(m => m.stage === 'Playoff_Final')

  function updateSeed(seed: number, teamId: string | null) {
    if (locked) return

    const updatedGroup = normalizeGroupState({
      ...normalizedGroup,
      group_teams: normalizedGroup.group_teams.map(slot =>
        slot.seed === seed ? { ...slot, team_id: teamId } : slot
      )
    })

    onChange(updatedGroup)
  }

  function updateScore(matchId: string, side: 'A' | 'B', value: number | null) {
    if (locked) return

    const updatedGroup = normalizeGroupState({
      ...normalizedGroup,
      matches: normalizedGroup.matches.map(match => {
        if (match.id !== matchId) return match

        const updated = {
          ...match,
          score_a: side === 'A' ? value : match.score_a,
          score_b: side === 'B' ? value : match.score_b
        }

        return {
          ...updated,
          status: getMatchStatusFromScores(updated)
        }
      })
    })

    onChange(updatedGroup)
  }

  function setWinner(matchId: string, winner: 'A' | 'B') {
    if (locked) return

    const match = normalizedGroup.matches.find(m => m.id === matchId)
    if (!match) return

    const score = getRequiredWins(match.format)
    const updatedGroup = normalizeGroupState({
      ...normalizedGroup,
      matches: normalizedGroup.matches.map(m =>
        m.id !== matchId
          ? m
          : {
              ...m,
              score_a: winner === 'A' ? score : 0,
              score_b: winner === 'B' ? score : 0,
              status: 'Finished'
            }
      )
    })

    onChange(updatedGroup)
  }

  function resetPlayoffs() {
    if (locked) return

    const updatedGroup = normalizeGroupState({
      ...normalizedGroup,
      group_teams: normalizedGroup.group_teams.map(slot => ({
        ...slot,
        team_id: null
      })),
      matches: normalizedGroup.matches.map(match => ({
        ...match,
        team_a_id: null,
        team_b_id: null,
        score_a: null,
        score_b: null,
        status: 'Scheduled'
      }))
    })

    onChange(updatedGroup)
  }

  return (
    <section className="rounded-sharp border border-[#3BD7A8] bg-[#111111] shadow-2xl shadow-[#3BD7A8]/10 overflow-hidden">
      {/* Header */}
      <div className="bg-[#080808] border-b border-[#3BD7A8] px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black uppercase tracking-widest text-[#3BD7A8]">PLAYOFFS</h2>
          <p className="mt-1 text-xs uppercase tracking-widest text-[#FFFFFF]/70">Single elimination · BO3 semis · BO5 final</p>
        </div>
        {!locked && (
          <button
            onClick={resetPlayoffs}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-sharp bg-[#F90E00] text-[#080808] transition hover:bg-[#e10500]"
          >
            Reset
          </button>
        )}
      </div>

      {/* Seed Selection Panel */}
      <div className="border-b border-[#3BD7A8] bg-[#080808] p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-[#FFFFFF]/80 mb-3">Select Seeds</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {slots.map(slot => (
            <div key={slot.seed} className="text-xs">
              <label className="block mb-1 text-[#FFFFFF]/80 font-semibold uppercase tracking-widest">Seed {slot.seed}</label>
              <select
                value={slot.team_id || ''}
                onChange={e => updateSeed(slot.seed, e.target.value || null)}
                disabled={locked}
                className="leif-select w-full px-2 py-1.5 rounded-sharp bg-[#080808] border border-[#3BD7A8] text-white text-xs outline-none focus:border-[#3BD7A8] disabled:opacity-50 cursor-pointer"
              >
                <option value="">TBD</option>
                {teams
                  .filter(
                    t =>
                      !assignedTeamIds.includes(t.id) ||
                      slot.team_id === t.id
                  )
                  .map(team => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Bracket Visualization */}
      <div className="p-6 overflow-x-auto">
        <div className="min-w-[800px] flex gap-12 items-start">
          {/* Semifinals Column */}
          <div className="w-48 flex-shrink-0 space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#FFFFFF]/70 mb-2">Semifinals</p>
              <MatchNode
                title="SF 1"
                match={semi1 ?? normalizedGroup.matches[0]}
                teamA={teams.find(team => team.id === semi1?.team_a_id) ?? null}
                teamB={teams.find(team => team.id === semi1?.team_b_id) ?? null}
                locked={locked}
                compact
                onScoreChange={updateScore}
                onWinner={setWinner}
              />
            </div>

            <div>
              <MatchNode
                title="SF 2"
                match={semi2 ?? normalizedGroup.matches[1]}
                teamA={teams.find(team => team.id === semi2?.team_a_id) ?? null}
                teamB={teams.find(team => team.id === semi2?.team_b_id) ?? null}
                locked={locked}
                compact
                onScoreChange={updateScore}
                onWinner={setWinner}
              />
            </div>
          </div>

          {/* Connector - Horizontal SVG */}
          <div className="w-20 flex-shrink-0 relative h-48">
            <svg className="w-full h-full" viewBox="0 0 80 200" preserveAspectRatio="none">
              <defs>
                <filter id="bracketGlowPlayoff">
                  <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              
              {/* Top line from SF1 to Final */}
              <path
                d="M 0 40 L 30 40 L 30 80 L 80 80"
                stroke="var(--accent)"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />
              
              {/* Glow for top line */}
              <path
                d="M 0 40 L 30 40 L 30 80 L 80 80"
                stroke="rgba(246, 201, 14, 0.3)"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                filter="url(#bracketGlowPlayoff)"
              />
              
              {/* Bottom line from SF2 to Final */}
              <path
                d="M 0 160 L 30 160 L 30 120 L 80 120"
                stroke="var(--accent)"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />
              
              {/* Glow for bottom line */}
              <path
                d="M 0 160 L 30 160 L 30 120 L 80 120"
                stroke="rgba(246, 201, 14, 0.3)"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                filter="url(#bracketGlowPlayoff)"
              />
            </svg>
          </div>

          {/* Grand Final Column */}
          <div className="w-48 flex-shrink-0">
            <p className="text-xs font-bold uppercase tracking-widest text-[#FFFFFF]/70 mb-2">Grand Final</p>
            <div className="rounded-sharp border-2 border-[#3BD7A8]/50 bg-[#3BD7A8]/10 p-1">
              <MatchNode
                title="FINAL"
                match={final ?? normalizedGroup.matches[2]}
                teamA={teams.find(team => team.id === final?.team_a_id) ?? null}
                teamB={teams.find(team => team.id === final?.team_b_id) ?? null}
                locked={locked}
                compact
                onScoreChange={updateScore}
                onWinner={setWinner}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
