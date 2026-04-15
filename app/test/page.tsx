import { createClient } from '@/lib/supabase/server'

export default async function TestPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('players').select('*') // change to your table later

  return (
    <div>
      <h1>Test Supabase Connection</h1>
      <pre>{JSON.stringify({ data, error }, null, 2)}</pre>
    </div>
  )
}