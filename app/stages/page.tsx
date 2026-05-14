import { createClient } from '@/lib/supabase/server'
import StagesClient from './StagesClient'
import { DbDate, DbGroup, Team } from '@/lib/tournamentData'

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

  const dates: DbDate[] = (datesData || []).map(date => ({
    ...date,
    id: String(date.id),
    groups: (date.groups || []).map((group: DbGroup) => ({
      ...group,
      id: String(group.id),
      date_id: String(group.date_id),
      group_teams: (group.group_teams || []).map(slot => ({
        ...slot,
        id: String(slot.id),
        group_id: String(slot.group_id),
        team_id: slot.team_id != null ? String(slot.team_id) : null
      })),
      matches: (group.matches || []).map(match => ({
        ...match,
        id: String(match.id),
        date_id: String(match.date_id),
        group_id: match.group_id != null ? String(match.group_id) : null,
        team_a_id: match.team_a_id != null ? String(match.team_a_id) : null,
        team_b_id: match.team_b_id != null ? String(match.team_b_id) : null
      }))
    }))
  }))

  return (
    <StagesClient
      initialDates={dates}
      teams={teams}
      isAuthenticated={isAuthenticated}
    />
  )
}

