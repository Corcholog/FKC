'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { DbMatch, DbGroupTeam } from '@/lib/tournamentData'

function parseNullableId(value: string | null | undefined) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

async function ensureAuthenticated(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return { authenticated: false, error: error?.message || 'Unauthorized' }
  }
  return { authenticated: true }
}

export async function saveDateState(dateId: string, matches: DbMatch[], groupTeams: DbGroupTeam[]) {
  const supabase = await createClient()
  const authCheck = await ensureAuthenticated(supabase)
  if (!authCheck.authenticated) {
    return { success: false, error: authCheck.error }
  }

  if (groupTeams.length > 0) {
    const payload = groupTeams.map(gt => ({
      group_id: parseNullableId(gt.group_id),
      team_id: parseNullableId(gt.team_id),
      seed: gt.seed
    }))

    const { error: gtError } = await supabase
      .from('tournament_group_teams')
      .upsert(payload, { onConflict: 'group_id,seed' })

    if (gtError) console.error('Error saving group teams:', gtError)
  }

  if (matches.length > 0) {
    const payload = matches.map(m => {
      const obj: any = {
        group_id: parseNullableId(m.group_id),
        date_id: parseNullableId(m.date_id),
        stage: m.stage,
        team_a_id: parseNullableId(m.team_a_id),
        team_b_id: parseNullableId(m.team_b_id),
        score_a: m.score_a,
        score_b: m.score_b,
        status: m.status,
        format: m.format
      }
      const parsedId = parseNullableId(m.id)
      if (parsedId !== null) obj.id = parsedId
      return obj
    })

    const { error: matchError } = await supabase
      .from('tournament_matches')
      .upsert(payload, { onConflict: 'group_id,stage' })

    if (matchError) console.error('Error saving matches:', matchError)
  }

  revalidatePath('/stages')
  return { success: true }
}

export async function lockDate(dateId: string) {
  const supabase = await createClient()
  const authCheck = await ensureAuthenticated(supabase)
  if (!authCheck.authenticated) {
    return { success: false, error: authCheck.error }
  }

  const { error } = await supabase
    .from('tournament_dates')
    .update({ is_locked: true })
    .eq('id', dateId)

  if (error) return { success: false, error: error.message }
  
  revalidatePath('/stages')
  return { success: true }
}

export async function unlockDate(dateId: string) {
  const supabase = await createClient()
  const authCheck = await ensureAuthenticated(supabase)
  if (!authCheck.authenticated) {
    return { success: false, error: authCheck.error }
  }

  const { data: groups, error: groupError } = await supabase
    .from('tournament_groups')
    .select('id')
    .eq('date_id', dateId)

  if (groupError) {
    console.error('Error fetching groups for unlock:', groupError)
    return { success: false, error: groupError.message }
  }

  const groupIds = (groups || []).map(group => group.id)

  if (groupIds.length > 0) {
    const { error: resetTeamsError } = await supabase
      .from('tournament_group_teams')
      .update({ team_id: null })
      .in('group_id', groupIds)

    if (resetTeamsError) {
      console.error('Error resetting group teams:', resetTeamsError)
      return { success: false, error: resetTeamsError.message }
    }
  }

  const { error: resetMatchesError } = await supabase
    .from('tournament_matches')
    .update({
      team_a_id: null,
      team_b_id: null,
      score_a: null,
      score_b: null,
      status: 'Scheduled'
    })
    .eq('date_id', dateId)

  if (resetMatchesError) {
    console.error('Error resetting matches:', resetMatchesError)
    return { success: false, error: resetMatchesError.message }
  }

  const { error: unlockError } = await supabase
    .from('tournament_dates')
    .update({ is_locked: false })
    .eq('id', dateId)

  if (unlockError) {
    console.error('Error unlocking date:', unlockError)
    return { success: false, error: unlockError.message }
  }

  revalidatePath('/stages')
  return { success: true }
}
