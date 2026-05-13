import { createClient } from '@/lib/supabase/server'
import StagesClient from './StagesClient'
import { DbDate, Team } from '@/lib/tournamentData'

export const revalidate = 0;

export default async function StagesPage() {
  const supabase = await createClient()

  const { data: teamsData } = await supabase
    .from('tournament_teams')
    .select('*')
    .order('name')

  const { data: authData } = await supabase.auth.getUser()
  const isAuthenticated = Boolean(authData?.user)

  const teams: Team[] = (teamsData || []).map((t: any) => ({
    id: String(t.id),
    name: t.name,
    tag: t.tag || 'TAG'
  }))

  // Ensure Fake Clan is included
  const fakeClanTeam: Team = { id: 'fake-clan', name: 'Fake Clan', tag: 'FKC' }
  if (!teams.some(t => t.id === fakeClanTeam.id)) {
    teams.push(fakeClanTeam)
  }

  const { data: datesData } = await supabase
    .from('tournament_dates')
    .select(`
      *,
      groups:tournament_groups(
        *,
        group_teams:tournament_group_teams(*),
        matches:tournament_matches(*)
      )
    `)
    .order('sequence_order')

  const dates: DbDate[] = datesData || []

  return (
    <StagesClient
      initialDates={dates}
      teams={teams}
      isAuthenticated={isAuthenticated}
    />
  )
}

