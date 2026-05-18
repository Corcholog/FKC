import Image from 'next/image'
import { getElo } from '@/lib/elo'

type Player = {
  id: number
  ign: string
  soloq_tier?: string
  soloq_rank?: string
  soloq_lp?: number
  flexq_tier?: string
  flexq_rank?: string
  flexq_lp?: number
  prev_soloq_tier?: string
  prev_soloq_rank?: string
  prev_soloq_lp?: number
  prev_flexq_tier?: string
  prev_flexq_rank?: string
  prev_flexq_lp?: number
}

type Team = {
  id: number
  name: string
  tournament_players: Player[]
}

export default function TeamCard({ team, avgEloStr }: { team: Team, avgEloStr: string }) {
  const getOpggLink = (ign: string) => {
    let gameName = ign
    let tagLine = 'LAN'
    if (ign.includes('#')) {
      const parts = ign.split('#')
      gameName = parts[0]
      tagLine = parts[1]
    }
    return `https://www.op.gg/summoners/las/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`
  }

  const getRankColor = (tier?: string) => {
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

  const getMultisearchUrl = (players: Player[]) => {
    const summoners = players.map(p => encodeURIComponent(p.ign)).join('%2C')
    return `https://op.gg/es/lol/multisearch/las?summoners=${summoners}`
  }

  const renderRankChange = (currentTier?: string, currentRank?: string, currentLp?: number, prevTier?: string, prevRank?: string, prevLp?: number) => {
    if (!currentTier && !prevTier) return null; // Unranked to Unranked
    if (!prevTier && currentTier) return <span title="New Rank" className="ml-1 cursor-help">😇</span>;
    if (prevTier && !currentTier) return <span title="Lost Rank" className="ml-1 cursor-help">😈</span>;
    
    const currentElo = getElo(currentTier, currentRank, currentLp);
    const prevElo = getElo(prevTier, prevRank, prevLp);
    
    if (currentElo > prevElo) return <span title={`Gained ${Math.round(currentElo - prevElo)} LP`} className="ml-1 text-emerald-400 drop-shadow-sm text-sm cursor-help">😇</span>;
    if (currentElo < prevElo) return <span title={`Lost ${Math.round(prevElo - currentElo)} LP`} className="ml-1 text-rose-400 drop-shadow-sm text-sm cursor-help">😈</span>;
    return <span title="No change" className="ml-1 text-slate-500 text-sm cursor-help opacity-50">➖</span>;
  }

  return (
    <div className="bg-card border border-blue-200 dark:border-[#322814] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:border-emerald-500/50 transition-colors group">
      <div className="bg-blue-50/50 dark:bg-[#091428] p-4 border-b border-blue-100 dark:border-[#322814] flex justify-between items-center group-hover:bg-emerald-500/10 transition-colors">
        <div className="flex items-center gap-2">
          <div>
            {team.tournament_players.length > 0 ? (
              <a
                href={getMultisearchUrl(team.tournament_players)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xl font-black text-slate-800 dark:text-[#f0e6d2] hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
                title="View team on OP.GG Multisearch"
              >
                {team.name}
              </a>
            ) : (
              <h2 className="text-xl font-black text-slate-800 dark:text-[#f0e6d2]">{team.name}</h2>
            )}
            {team.tournament_players.length > 0 && (
              <div className={`text-xs font-bold mt-1 ${getRankColor(avgEloStr)}`}>
                Avg Elo: {avgEloStr}
              </div>
            )}
          </div>
        </div>
        <span className="text-xs font-bold px-2 py-1 bg-blue-100 dark:bg-[#1e2328] text-blue-600 dark:text-blue-400 rounded-full">
          {team.tournament_players.length} Players
        </span>
      </div>
      <div className="p-4 space-y-3">
        {team.tournament_players.length === 0 ? (
          <p className="text-slate-500 text-sm italic">No players listed.</p>
        ) : (
          team.tournament_players.map(player => (
            <div key={player.id} className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-[#1e2328]/50 border border-transparent hover:border-emerald-200 dark:hover:border-emerald-900 transition-all">
              <div className="flex-1">
                <a 
                  href={getOpggLink(player.ign)} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="font-bold text-sm text-slate-700 dark:text-[#f0e6d2] hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors inline-flex items-center gap-1"
                  title="View on OP.GG"
                >
                  {player.ign}
                  <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
                <div className="flex gap-4 mt-1 text-xs font-semibold text-slate-500">
                  <div className="flex items-center">
                    Solo: <span className={`ml-1 ${getRankColor(player.soloq_tier)}`}>
                      {player.soloq_tier ? `${player.soloq_tier} ${player.soloq_rank} (${player.soloq_lp}LP)` : 'Unranked'}
                    </span>
                    {renderRankChange(player.soloq_tier, player.soloq_rank, player.soloq_lp, player.prev_soloq_tier, player.prev_soloq_rank, player.prev_soloq_lp)}
                  </div>
                  <div className="flex items-center">
                    Flex: <span className={`ml-1 ${getRankColor(player.flexq_tier)}`}>
                      {player.flexq_tier ? `${player.flexq_tier} ${player.flexq_rank} (${player.flexq_lp}LP)` : 'Unranked'}
                    </span>
                    {renderRankChange(player.flexq_tier, player.flexq_rank, player.flexq_lp, player.prev_flexq_tier, player.prev_flexq_rank, player.prev_flexq_lp)}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
