import { createClient } from '@/lib/supabase/server'
import AdminForm from './AdminForm'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: players } = await supabase.from('players').select('id, name, ign, role, puuid')

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdminForm players={players || []} />
    </div>
  )
}