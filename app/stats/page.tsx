import { createClient } from '@/lib/supabase/server'
import Navbar from '@/app/components/Navbar'
import StatsContainer from './StatsContainer'

export default async function StatsPage() {
  const supabase = await createClient()

  // Fetch players
  const { data: playersData } = await supabase
    .from('players')
    .select('*')
  
  const players = playersData || []

  // Fetch all player performances for the Team Stats
  const { data: teamPerformancesData } = await supabase
    .from('ally_participants')
    .select(`
      id,
      player_id,
      match_id,
      champion,
      kills,
      deaths,
      assists,
      score,
      cs,
      damage_dealt,
      gold_earned,
      vision_score,
      damage_taken,
      team_total_damage,
      team_total_gold,
      team_total_kills,
      team_total_deaths,
      matches!inner (id, we_won, match_type, duration_minutes, duration_seconds)
    `)
  
  const teamPerformances = teamPerformancesData || []

  // Fetch all soloq matches
  const { data: soloqPerformancesData } = await supabase
    .from('soloq_matches')
    .select('*')
  
  const soloqPerformances = soloqPerformancesData || []

  return (
    <main className="h-screen bg-background text-foreground pt-16 overflow-hidden">
      <Navbar />

      <StatsContainer 
        players={players} 
        teamPerformances={teamPerformances} 
        soloqPerformances={soloqPerformances} 
      />
    </main>
  )
}