'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/app/components/Navbar'
import PlayerStats from './PlayerStats'
import TeamOverview from './TeamOverview'

export default function StatsPage() {
  const [players, setPlayers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlayerId, setSelectedPlayerId] = useState<number>(0)
  
  const supabase = createClient()

  useEffect(() => {
    const fetchPlayers = async () => {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('name')
      
      if (data && data.length > 0) {
        setPlayers(data)
        setSelectedPlayerId(data[0].id)
      }
      setLoading(false)
    }

    fetchPlayers()
  }, [])

  if (loading) return <div className="min-h-screen bg-[#f4faff] p-8 text-center text-[#0984e3] font-bold">Loading Team Data...</div>

  return (
    <main className="min-h-screen bg-[#f4faff] pb-20 pt-16 text-slate-900">
      <Navbar />

      <TeamOverview 
        players={players} 
        selectedPlayerId={selectedPlayerId} 
        onPlayerSelect={setSelectedPlayerId} 
      />
      
      <div className="w-full max-w-[1400px] mx-auto px-8 py-8 border-t border-slate-200 mt-8">
        {/* Aquí quitamos el onPlayerSelect, ya no lo necesitamos abajo */}
        <PlayerStats 
          players={players} 
          selectedPlayerId={selectedPlayerId} 
        />
      </div>
    </main>
  )
}