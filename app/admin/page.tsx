import { createClient } from '@/lib/supabase/server'
import AdminForm from './AdminForm'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: players } = await supabase.from('players').select('id, name, ign, role, puuid')

  return (
    <div className="min-h-screen bg-[#f4faff] text-slate-900">
      <AdminForm players={players || []} />
    </div>
  )
}