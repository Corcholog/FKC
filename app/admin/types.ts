export type Player = {
  id: number
  name: string
  ign: string
  role: string
  puuid: string
}

export type FormData = {
  date: string
  match_type: string
  our_side: 'Blue' | 'Red'
  we_won: boolean
  duration_minutes: number
  duration_seconds: number
  enemy_team_name: string
  notes: string
  matchId?: string
  our_bans: string[]
  enemy_bans: string[]
  our_participants: {
    player_id: number
    champion: string
    role: string
    kills: number
    deaths: number
    assists: number
    cs: number
    score: number
  }[]
  enemy_participants: {
    champion: string
    role: string
    kills: number
    deaths: number
    assists: number
    cs: number
  }[]
}
