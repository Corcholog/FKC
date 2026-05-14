import { DbMatch, Team, getMatchTitle, getRequiredWins, getMatchStatusFromScores } from '@/lib/tournamentData'

interface Props {
  title: string
  match: DbMatch
  teamA: Team | null
  teamB: Team | null
  locked: boolean
  disableTeamSelection?: boolean
  compact?: boolean
  onScoreChange: (matchId: string, side: 'A' | 'B', value: number | null) => void
  onWinner: (matchId: string, side: 'A' | 'B') => void
}

export default function MatchNode({
  title,
  match,
  teamA,
  teamB,
  locked,
  disableTeamSelection,
  compact = false,
  onScoreChange,
  onWinner
}: Props) {
  const requiredWins = getRequiredWins(match.format)
  const status = getMatchStatusFromScores(match)
  const winnerId =
    match.status === 'Finished' && match.score_a !== null && match.score_b !== null && match.score_a !== match.score_b
      ? match.score_a > match.score_b
        ? 'A'
        : 'B'
      : null

  function handleScore(side: 'A' | 'B', raw: string) {
    const sanitized = raw === '' ? null : Math.max(0, Math.min(requiredWins, Number(raw)))
    onScoreChange(match.id, side, sanitized)
  }

  const isBo1 = match.format === 'Bo1'

  return (
    <div className="rounded-sharp border border-[#3BD7A8] bg-[#111111] shadow-lg shadow-[#3BD7A8]/10">
      {/* Header */}
      <div className="border-b border-[#3BD7A8] px-3 py-2 flex items-center justify-between bg-[#080808]">
        <div className="min-w-0">
          <p className="text-[0.65rem] uppercase tracking-widest text-[#FFFFFF]/70 truncate">{title}</p>
        </div>
        <div className="ml-2 flex-shrink-0 rounded-sm bg-[#3BD7A8] px-2 py-1 text-[0.6rem] uppercase tracking-widest text-[#080808] font-semibold">
          {status}
        </div>
      </div>

      {/* Teams Container */}
      <div className="divide-y divide-border">
        {(['A', 'B'] as const).map(side => {
          const team = side === 'A' ? teamA : teamB
          const isWinner = winnerId === side
          const score = side === 'A' ? match.score_a : match.score_b

          return (
            <div
              key={side}
              className={`px-3 py-2 transition ${
                isWinner
                  ? 'bg-gradient-to-r from-[#3BD7A8]/15 to-transparent border-l-2 border-[#3BD7A8]'
                  : 'hover:bg-[#080808]/80'
              }`}
            >
              <div className="flex items-center gap-2 justify-between">
                {/* Team info */}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">
                    {team ? `${team.name}` : 'TBD'}
                  </p>
                  {team && <p className="text-[0.65rem] text-[#FFFFFF]/70">{team.tag}</p>}
                </div>

                {/* Score input or WIN button */}
                {isBo1 ? (
                  <button
                    type="button"
                    disabled={locked || !team}
                    onClick={() => onWinner(match.id, side)}
                    className="ml-2 flex-shrink-0 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-widest rounded-sharp bg-[#3BD7A8] text-[#080808] transition hover:bg-[#2fc499] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    WIN
                  </button>
                ) : (
                  <>
                    <input
                      type="number"
                      min={0}
                      max={requiredWins}
                      value={score ?? ''}
                      onChange={e => handleScore(side, e.target.value)}
                      disabled={locked || !team}
                      className="w-10 h-8 rounded-sharp border border-[#3BD7A8] bg-[#080808] text-center font-bold text-[#3BD7A8] text-sm outline-none transition focus:border-[#3BD7A8] focus:ring-1 focus:ring-[#3BD7A8]/30 disabled:opacity-40"
                    />

                    {/* Winner button */}
                    <button
                      type="button"
                      disabled={locked || !team}
                      onClick={() => onWinner(match.id, side)}
                      className="ml-2 flex-shrink-0 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-widest rounded-sharp bg-[#3BD7A8] text-[#080808] transition hover:bg-[#2fc499] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      WIN
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer - Format info */}
      <div className="px-3 py-2 text-[0.65rem] uppercase tracking-widest text-[#FFFFFF]/70 border-t border-[#3BD7A8] bg-[#080808] flex items-center justify-between">
        <span>BO{requiredWins * 2 - 1}</span>
        <span>{match.format}</span>
      </div>
    </div>
  )
}
