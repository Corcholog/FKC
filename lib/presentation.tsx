import { getElo } from '@/lib/elo';

type PresentationPlayer = {
  ign: string;
};

export const getOpggLink = (ign: string) => {
  let gameName = ign;
  let tagLine = 'LAN';
  if (ign.includes('#')) {
    const parts = ign.split('#');
    gameName = parts[0];
    tagLine = parts[1];
  }
  return `https://www.op.gg/summoners/las/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`;
};

export const getMultisearchUrl = (players: PresentationPlayer[]) => {
  const summoners = players.map(p => encodeURIComponent(p.ign)).join('%2C');
  return `https://op.gg/es/lol/multisearch/las?summoners=${summoners}`;
};

export const getRankColor = (tier?: string) => {
  if (!tier) return 'text-slate-500';
  const t = tier.toLowerCase();
  if (t.includes('iron')) return 'text-iron';
  if (t.includes('bronze')) return 'text-bronze';
  if (t.includes('silver')) return 'text-silver';
  if (t.includes('gold')) return 'text-gold';
  if (t.includes('platinum')) return 'text-platinum';
  if (t.includes('emerald')) return 'text-emerald';
  if (t.includes('diamond')) return 'text-diamond';
  if (t.includes('master')) return 'text-master';
  if (t.includes('grandmaster')) return 'text-grandmaster';
  if (t.includes('challenger')) return 'text-challenger';
  return 'text-slate-300';
};

export const renderRankChange = (currentTier?: string, currentRank?: string, currentLp?: number, prevTier?: string, prevRank?: string, prevLp?: number) => {
  if (!currentTier && !prevTier) return null; // Unranked to Unranked
  if (!prevTier && currentTier) return <span title="New Rank" className="ml-1 cursor-help">😇</span>;
  if (prevTier && !currentTier) return <span title="Lost Rank" className="ml-1 cursor-help">😈</span>;
  
  const currentElo = getElo(currentTier, currentRank, currentLp);
  const prevElo = getElo(prevTier, prevRank, prevLp);
  
  if (currentElo > prevElo) return <span title={`Gained ${Math.round(currentElo - prevElo)} LP`} className="ml-1 text-emerald-400 drop-shadow-sm text-sm cursor-help">😇</span>;
  if (currentElo < prevElo) return <span title={`Lost ${Math.round(prevElo - currentElo)} LP`} className="ml-1 text-rose-400 drop-shadow-sm text-sm cursor-help">😈</span>;
  return <span title="No change" className="ml-1 text-slate-500 text-sm cursor-help opacity-50">➖</span>;
};
