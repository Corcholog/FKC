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
      <div className="px-3 py-2 border-b border-border bg-card rounded-t-sharp">
        <h2 className="text-sm font-black uppercase tracking-widest text-accent">Global Standings</h2>
        <p className="mt-1 text-xs text-muted-foreground uppercase tracking-widest">Top 4 qualify for playoffs</p>
      </div>

      {/* Standings List */}
      <div className="space-y-1 rounded-b-sharp border border-t-0 border-border bg-popover divide-y divide-border overflow-hidden">
        {standings.map((row, idx) => {
          const isQualified = row.qualified
          const position = idx + 1

          return (
            <div
              key={row.teamId}
              className={`px-3 py-2 transition ${
                isQualified
                  ? 'bg-gradient-to-r from-accent/12 to-transparent border-l-3 border-accent'
                  : 'hover:bg-card/50'
              }`}
            >
              <div className="flex items-center gap-2 justify-between">
                {/* Position + Team */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className={`flex-shrink-0 w-6 h-6 rounded-sharp flex items-center justify-center font-bold text-xs ${
                      isQualified
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {position}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{row.team.name}</p>
                    </div>
                  </div>
                </div>

                {/* Total Points */}
                <div className="flex-shrink-0 text-right">
                  <p className="text-lg font-black text-accent">{row.totalPoints}</p>
                </div>
              </div>

              {/* Qualified Badge */}
              {isQualified && (
                <div className="mt-1 inline-block px-2 py-0.5 text-xs font-bold uppercase tracking-widest rounded-sharp bg-accent/20 text-accent border border-accent/40">
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
