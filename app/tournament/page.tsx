import { createClient } from '@/lib/supabase/server'
import Navbar from '@/app/components/Navbar'
import TeamCard from './TeamCard'
import { calculateTeamWeightedElo, eloToString } from '@/lib/elo'

export const revalidate = 0; // Ensure fresh data on every load for scouting

export default async function TournamentPage() {
  const supabase = await createClient()

  const { data: teams, error } = await supabase
    .from('tournament_teams')
    .select('*, tournament_players(*)')
    .order('name')

  // Fetch players for Fake Clan
  const { data: playersData } = await supabase
    .from('players')
    .select('*')

  const parsedTeams = (teams || []).map(team => {
    const weightedElo = calculateTeamWeightedElo(team.tournament_players)
    return {
      ...team,
      weightedElo,
      avgEloStr: eloToString(weightedElo)
    }
  })

  // Ensure Fake Clan is included
  const fakeClanTeam = { id: 'fake-clan', name: 'Fake Clan', tag: 'FKC', tournament_players: playersData || [] }
  const fakeClanWeightedElo = calculateTeamWeightedElo(fakeClanTeam.tournament_players)
  if (!parsedTeams.some(t => t.id === fakeClanTeam.id)) {
    parsedTeams.push({
      ...fakeClanTeam,
      weightedElo: fakeClanWeightedElo,
      avgEloStr: eloToString(fakeClanWeightedElo)
    })
  }

  parsedTeams.sort((a, b) => b.weightedElo - a.weightedElo)

  return (
    <main className="min-h-screen bg-background text-foreground pt-16">
      <Navbar />
      
      <div className="max-w-[1400px] mx-auto px-6 py-12">
        <header className="mb-12">
          <h1 className="text-4xl md:text-5xl font-black text-foreground mb-4">
            LIGA E-SPORTS INTER FACULTADES 8 - SCOUTING
          </h1>
          <p className="text-lg text-slate-500 max-w-2xl font-medium">
            Futuras victimas de Fake Clan.
          </p>
        </header>

        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl mb-8 font-bold">
            Failed to load teams. Make sure the database tables are created.
          </div>
        )}

        {parsedTeams.length === 0 && !error ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-blue-200 dark:border-[#322814] rounded-2xl">
            <h3 className="text-2xl font-black text-slate-600 dark:text-slate-400 mb-2">No Teams Found</h3>
            <p className="text-slate-500 mb-6">Add teams and players in the Admin Dashboard to start scouting.</p>
            <a href="/admin" className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-emerald-500/25">
              Go to Admin Dashboard
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {parsedTeams.map((team: any) => (
              <TeamCard key={team.id} team={team} avgEloStr={team.avgEloStr} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
