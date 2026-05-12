export const TIER_BASE: Record<string, number> = {
  'iron': 0, 'bronze': 400, 'silver': 800, 'gold': 1200, 
  'platinum': 1600, 'emerald': 2000, 'diamond': 2400, 
  'master': 2800, 'grandmaster': 3200, 'challenger': 3600
}

export const RANK_BASE: Record<string, number> = {
  'iv': 0, 'iii': 100, 'ii': 200, 'i': 300
}

export const getElo = (tier?: string, rank?: string, lp?: number) => {
  if (!tier) return 0
  const t = tier.toLowerCase()
  const r = (rank || 'IV').toLowerCase()
  const base = TIER_BASE[t] ?? 0
  const rb = ['master', 'grandmaster', 'challenger'].includes(t) ? 0 : (RANK_BASE[r] ?? 0)
  return base + rb + (lp || 0)
}

export const eloToString = (elo: number) => {
  if (elo === 0) return 'Unranked'
  const tiers = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master', 'Grandmaster', 'Challenger']
  const ranks = ['IV', 'III', 'II', 'I']
  
  if (elo >= 2800) {
    if (elo >= 3600) return `Challenger (${Math.round(elo - 3600)} LP)`
    if (elo >= 3200) return `Grandmaster (${Math.round(elo - 3200)} LP)`
    return `Master (${Math.round(elo - 2800)} LP)`
  }
  
  const tierIdx = Math.floor(elo / 400)
  const remainder = elo % 400
  const rankIdx = Math.floor(remainder / 100)
  const lp = Math.round(remainder % 100)
  
  const tierName = tiers[Math.min(tierIdx, tiers.length - 1)]
  const rankName = ranks[Math.min(rankIdx, ranks.length - 1)]
  
  return `${tierName} ${rankName} (${lp} LP)`
}

export const calculateTeamWeightedElo = (players: any[]) => {
  if (!players || players.length === 0) return 0;
  
  let totalWeighted = 0;
  let validPlayers = 0;
  // We use a cubic mean to heavily weight higher ranks
  const POWER = 3; 

  players.forEach(p => {
    const solo = getElo(p.soloq_tier, p.soloq_rank, p.soloq_lp);
    const flex = getElo(p.flexq_tier, p.flexq_rank, p.flexq_lp);
    const max = Math.max(solo, flex);
    if (max > 0) {
      totalWeighted += Math.pow(max, POWER);
      validPlayers++;
    }
  });

  if (validPlayers === 0) return 0;
  return Math.pow(totalWeighted / validPlayers, 1 / POWER);
}

export const getRankColor = (tier?: string) => {
  if (!tier) return 'text-slate-500'
  const t = tier.toLowerCase()
  if (t.includes('iron')) return 'text-slate-500'
  if (t.includes('bronze')) return 'text-[#8C513A]'
  if (t.includes('silver')) return 'text-[#80989D]'
  if (t.includes('gold')) return 'text-[#CD8837]'
  if (t.includes('platinum')) return 'text-[#4E9996]'
  if (t.includes('emerald')) return 'text-[#25B47B]'
  if (t.includes('diamond')) return 'text-[#576BCE]'
  if (t.includes('master')) return 'text-[#9D48E0]'
  if (t.includes('grandmaster')) return 'text-[#E84057]'
  if (t.includes('challenger')) return 'text-[#F4C874]'
  return 'text-slate-300'
}
