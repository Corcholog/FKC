'use client'

import {
  DbGroup,
  DbMatch,
  Team,
  MatchStatus,
  ensureGroupSlots,
  normalizeGroupState,
  getMatchStatusFromScores,
  getRequiredWins
} from '@/lib/tournamentData'
import TeamSelect from './TeamSelect'
import MatchNode from './MatchNode'
import BracketConnector from '@/app/components/BracketConnector'

interface Props {
  group: DbGroup
  teams: Team[]
  locked: boolean
  onChange: (group: DbGroup) => void
}

export default function MiniBracket({
  group,
  teams,
  locked,
  onChange
}: Props) {
  const normalizedGroup = normalizeGroupState(group)
  const slots = ensureGroupSlots(normalizedGroup)
  const usedTeamIds = slots.map(slot => slot.team_id).filter(Boolean) as string[]

  const semi1 = normalizedGroup.matches.find(m => m.stage === 'Semifinal_1')
  const semi2 = normalizedGroup.matches.find(m => m.stage === 'Semifinal_2')
  const final = normalizedGroup.matches.find(m => m.stage === 'Final')
  const third = normalizedGroup.matches.find(m => m.stage === 'Third_Place')

  function updateSlot(seed: number, teamId: string | null) {
    if (locked) return

    const updatedGroup: DbGroup = normalizeGroupState({
      ...normalizedGroup,
      group_teams: normalizedGroup.group_teams.map(slot =>
        slot.seed === seed
          ? { ...slot, team_id: teamId }
          : slot
      )
    })

    onChange(updatedGroup)
  }

  function updateScore(matchId: string, side: 'A' | 'B', value: number | null) {
    if (locked) return

    const updatedGroup: DbGroup = normalizeGroupState({
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
    let updatedMatches = normalizedGroup.matches.map(m =>
      m.id !== matchId
        ? m
        : {
            ...m,
            score_a: winner === 'A' ? score : 0,
            score_b: winner === 'B' ? score : 0,
            status: 'Finished' as MatchStatus
          }
    )

    // Auto-advancing logic
    if (match.stage === 'Semifinal_1') {
      const winnerTeamId = winner === 'A' ? match.team_a_id : match.team_b_id
      const loserTeamId = winner === 'A' ? match.team_b_id : match.team_a_id
      updatedMatches = updatedMatches.map(m => {
        if (m.stage === 'Final') {
          return { ...m, team_a_id: winnerTeamId }
        } else if (m.stage === 'Third_Place') {
          return { ...m, team_a_id: loserTeamId }
        }
        return m
      })
    } else if (match.stage === 'Semifinal_2') {
      const winnerTeamId = winner === 'A' ? match.team_a_id : match.team_b_id
      const loserTeamId = winner === 'A' ? match.team_b_id : match.team_a_id
      updatedMatches = updatedMatches.map(m => {
        if (m.stage === 'Final') {
          return { ...m, team_b_id: winnerTeamId }
        } else if (m.stage === 'Third_Place') {
          return { ...m, team_b_id: loserTeamId }
        }
        return m
      })
    }

    const updatedGroup: DbGroup = normalizeGroupState({
      ...normalizedGroup,
      matches: updatedMatches
    })

    onChange(updatedGroup)
  }

  function resetGroup() {
    if (locked) return

    const updatedGroup: DbGroup = normalizeGroupState({
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
    <section className="rounded-sharp border border-border bg-popover shadow-2xl shadow-black/40 overflow-hidden">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black uppercase tracking-widest text-accent">{group.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground uppercase tracking-widest">Double elimination · BO1 matches</p>
        </div>
        {!locked && (
          <button
            onClick={resetGroup}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-sharp bg-destructive text-destructive-foreground transition hover:bg-destructive/80 hover:glow-gold"
          >
            Reset
          </button>
        )}
      </div>

      {/* Tournament Tree Layout */}
      <div className="p-4 flex flex-col items-center space-y-6">
        {/* Seeds Selection */}
        <div className="w-full max-w-md">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 px-1">Select Seeds</p>
          <div className="grid grid-cols-2 gap-3">
            {slots.map(slot => (
              <div key={slot.seed} className="text-xs">
                <label className="block mb-1 text-muted-foreground font-semibold uppercase tracking-widest">Seed {slot.seed}</label>
                <select
                  value={slot.team_id || ''}
                  onChange={e => updateSlot(slot.seed, e.target.value || null)}
                  disabled={locked}
                  className="w-full px-2 py-1.5 rounded-sharp bg-card border border-border text-foreground text-xs outline-none focus:border-accent disabled:opacity-50 cursor-pointer"
                >
                  <option value="">TBD</option>
                  {teams
                    .filter(t => !usedTeamIds.includes(t.id) || slot.team_id === t.id)
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

        {/* Horizontal Bracket Layout */}
        <div className="relative flex space-x-8 items-center">
          {/* Left Column: Semifinals */}
          <div className="flex flex-col space-y-4">
            {/* SF 1 */}
            <div className="relative">
              <MatchNode
                compact
                title="SF 1"
                match={semi1 ?? { ...normalizedGroup.matches[0] }}
                teamA={teams.find(team => team.id === semi1?.team_a_id) ?? null}
                teamB={teams.find(team => team.id === semi1?.team_b_id) ?? null}
                locked={locked}
                onScoreChange={updateScore}
                onWinner={setWinner}
              />
              {/* Horizontal connector to Final */}
              <div className="absolute top-1/2 left-full w-16 h-8 transform -translate-y-1/2">
                <BracketConnector
                  fromTop={0}
                  fromBottom={64}
                  toTop={0}
                  direction="horizontal"
                  isWinner={true}
                />
              </div>
            </div>

            {/* SF 2 */}
            <div className="relative">
              <MatchNode
                compact
                title="SF 2"
                match={semi2 ?? { ...normalizedGroup.matches[1] }}
                teamA={teams.find(team => team.id === semi2?.team_a_id) ?? null}
                teamB={teams.find(team => team.id === semi2?.team_b_id) ?? null}
                locked={locked}
                onScoreChange={updateScore}
                onWinner={setWinner}
              />
              {/* Horizontal connector to 3rd Place */}
              <div className="absolute top-1/2 left-full w-16 h-8 transform -translate-y-1/2">
                <BracketConnector
                  fromTop={0}
                  fromBottom={64}
                  toTop={0}
                  direction="horizontal"
                  isWinner={false}
                />
              </div>
            </div>
          </div>

          {/* Right Column: Finals */}
          <div className="flex flex-col space-y-4">
            {/* Winners Final */}
            <div className="glow-gold rounded-sharp border-2 border-accent/50 bg-gradient-to-r from-accent/10 to-transparent p-2">
              <p className="text-xs font-bold uppercase tracking-widest text-accent mb-2 text-center">Winners Final</p>
              <MatchNode
                compact
                title="WF"
                match={final ?? { ...normalizedGroup.matches[2] }}
                teamA={teams.find(team => team.id === final?.team_a_id) ?? null}
                teamB={teams.find(team => team.id === final?.team_b_id) ?? null}
                locked={locked}
                onScoreChange={updateScore}
                onWinner={setWinner}
              />
            </div>

            {/* 3rd Place */}
            <div className="glow-silver rounded-sharp border-2 border-muted/50 bg-gradient-to-r from-muted/10 to-transparent p-2">
              <p className="text-xs font-bold uppercase tracking-widest text-muted mb-2 text-center">3rd Place</p>
              <MatchNode
                compact
                title="LM"
                match={third ?? { ...normalizedGroup.matches[3] }}
                teamA={teams.find(team => team.id === third?.team_a_id) ?? null}
                teamB={teams.find(team => team.id === third?.team_b_id) ?? null}
                locked={locked}
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
