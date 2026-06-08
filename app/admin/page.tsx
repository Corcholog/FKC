import { createClient } from '@/lib/supabase/server'
import AdminForm from './AdminForm'

export default async function AdminPage() {
  const supabase = await createClient()
  
  // Fetch players
  const { data: players } = await supabase.from('players').select('id, name, ign, role, puuid')

  // Check if player ID 4 is still named Zair, and update to Splaca if so
  const zairPlayer = players?.find(p => p.id === 4 && p.name === 'Zair');
  if (zairPlayer) {
    console.log('[AdminPage] Auto-renaming player Zair to Splaca in Supabase...');
    const { data: updated, error } = await supabase
      .from('players')
      .update({ name: 'Splaca' })
      .eq('id', 4)
      .select();
    
    if (error) {
      console.error('[AdminPage] Failed to auto-rename player Zair to Splaca:', error);
    } else {
      console.log('[AdminPage] Successfully renamed player in Supabase:', updated);
      // Re-fetch players to ensure the updated name is passed to the admin form
      const { data: refreshedPlayers } = await supabase.from('players').select('id, name, ign, role, puuid')
      return (
        <div className="min-h-screen bg-background text-foreground">
          <AdminForm players={refreshedPlayers || []} />
        </div>
      )
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdminForm players={players || []} />
    </div>
  )
}