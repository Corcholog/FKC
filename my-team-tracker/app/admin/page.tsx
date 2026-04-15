import { createClient } from '@/lib/supabase/server'
import AdminForm from './AdminForm'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: players } = await supabase.from('players').select('id, name, ign, role, puuid')

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <AdminForm players={players || []} />
      </div>
    </div>
  )
}