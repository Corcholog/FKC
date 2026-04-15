'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/app/components/Navbar'
import PlayerStats from './PlayerStats'
import TeamOverview from './TeamOverview'

export default function StatsPage() {
  const [players, setPlayers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchPlayers = async () => {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('name')
      
      if (data) setPlayers(data)
      setLoading(false)
    }

    fetchPlayers()
  }, [])

  if (loading) return <div className="min-h-screen bg-zinc-950 p-8 text-center text-yellow-400">Loading Team Data...</div>

  return (
    <main className="min-h-screen bg-zinc-950 pb-20 pt-16">
      <Navbar />

      {/* 1. The 5-Player Team Roster Cards */}
      <TeamOverview players={players} />
      
      <div className="w-full max-w-[1400px] mx-auto px-8 py-8 border-t border-zinc-800 mt-8">
         {/* 2. The Detailed Individual Player Stats */}
        <PlayerStats players={players} />
      </div>
    </main>
  )
}