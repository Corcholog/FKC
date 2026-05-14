import { TeamPoints, Team } from '@/lib/tournamentData'

interface Props {
  standings: (TeamPoints & {
    team: Team
  })[]
}

export default function GlobalStandings({
  standings
}: Props) {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#3BD7A8] bg-[#080808] rounded-t-sharp">
        <h2 className="text-sm font-black uppercase tracking-widest text-[#3BD7A8]">Global Standings</h2>
        <p className="mt-1 text-xs text-[#FFFFFF]/70 uppercase tracking-widest">Top 4 qualify for playoffs</p>
      </div>

      {/* Standings List */}
      <div className="space-y-1 rounded-b-sharp border border-[#3BD7A8] border-t-0 bg-[#111111] divide-y divide-[#3BD7A8]/30 overflow-hidden">
        {standings.map((row, idx) => {
          const isQualified = row.qualified
          const position = idx + 1

          return (
            <div
              key={row.teamId}
              className={`px-3 py-2 transition ${
                isQualified
                  ? 'bg-gradient-to-r from-[#3BD7A8]/12 to-transparent border-l-3 border-[#3BD7A8]'
                  : 'hover:bg-[#080808]/80'
              }`}
            >
              <div className="flex items-center gap-2 justify-between">
                {/* Position + Team */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className={`flex-shrink-0 w-6 h-6 rounded-sharp flex items-center justify-center font-bold text-xs ${
                      isQualified
                        ? 'bg-[#3BD7A8] text-[#080808]'
                        : 'bg-[#F90E00]/20 text-[#F90E00]'
                    }`}>
                      {position}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{row.team.name}</p>
                    </div>
                  </div>
                </div>

                {/* Total Points */}
                <div className="flex-shrink-0 text-right">
                  <p className="text-lg font-black text-[#3BD7A8]">{row.totalPoints}</p>
                </div>
              </div>

              {/* Qualified Badge */}
              {isQualified && (
                <div className="mt-1 inline-block px-2 py-0.5 text-xs font-bold uppercase tracking-widest rounded-sharp bg-[#3BD7A8]/20 text-[#3BD7A8] border border-[#3BD7A8]/40">
                  ✓ Qualified
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
