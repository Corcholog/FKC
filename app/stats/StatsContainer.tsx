'use client'
import { useState, useMemo } from 'react'
import Image from 'next/image'
import PlayerLinks from '@/app/components/PlayerLinks'
import { getChampionIcon } from '@/lib/champions'
import PlayerRadarChart from '@/app/components/PlayerRadarChart'
import { calculateRadarStats, determineArchetype, getDynamicTraits, calculateBadges, normalizeRole } from '@/lib/archetypes'

// Color Helpers
const getColorWR = (wr: number) => {
  if (wr >= 60) return 'text-blue-400'
  if (wr >= 53) return 'text-green-400'
  if (wr >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

const getColorKDA = (kda: number) => {
  if (kda >= 3.6) return 'text-blue-400'
  if (kda >= 3.0) return 'text-green-400'
  if (kda >= 2.0) return 'text-yellow-400'
  return 'text-red-400'
}

const getColorAvgScore = (score: number) => {
  if (score >= 60) return 'text-blue-500'
  if (score >= 40) return 'text-green-500'
  if (score >= 25) return 'text-yellow-500'
  return 'text-rose-500'
}

const getColorCS = (cs: number, role: string) => {
  if (role.toUpperCase() === 'SUPPORT') return 'text-slate-400'
  if (cs >= 8.0) return 'text-blue-400'
  if (cs >= 6.0) return 'text-green-400'
  return 'text-red-400'
}

const getTierBorderColor = (tier: string) => {
  switch (tier?.toUpperCase()) {
    case 'IRON': return 'border-gray-500 shadow-[0_0_15px_rgba(107,114,128,0.3)]'
    case 'BRONZE': return 'border-amber-700 shadow-[0_0_15px_rgba(180,83,9,0.3)]'
    case 'SILVER': return 'border-slate-400 shadow-[0_0_15px_rgba(148,163,184,0.3)]'
    case 'GOLD': return 'border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.3)]'
    case 'PLATINUM': return 'border-teal-400 shadow-[0_0_15px_rgba(45,212,191,0.3)]'
    case 'EMERALD': return 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
    case 'DIAMOND': return 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
    case 'MASTER': return 'border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
    case 'GRANDMASTER': return 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
    case 'CHALLENGER': return 'border-cyan-300 shadow-[0_0_15px_rgba(103,232,249,0.5)]'
    default: return 'border-zinc-200 dark:border-[#322814]'
  }
}

const getTierTextColor = (tier: string) => {
  switch (tier?.toUpperCase()) {
    case 'IRON': return 'text-gray-500'
    case 'BRONZE': return 'text-amber-700'
    case 'SILVER': return 'text-slate-400'
    case 'GOLD': return 'text-yellow-400'
    case 'PLATINUM': return 'text-teal-400'
    case 'EMERALD': return 'text-emerald-500'
    case 'DIAMOND': return 'text-blue-500'
    case 'MASTER': return 'text-purple-500'
    case 'GRANDMASTER': return 'text-red-500'
    case 'CHALLENGER': return 'text-cyan-300'
    default: return 'text-slate-500'
  }
}

const ROLE_ORDER = ['top', 'jungle', 'mid', 'adc', 'support']

type Mode = 'team' | 'soloq' | 'mixed';
type MatchTypeFilter = 'all' | 'competitive' | 'scrim' | 'flex' | 'clash';

interface StatsContainerProps {
  players: any[];
  teamPerformances: any[];
  soloqPerformances: any[];
}

export default function StatsContainer({ players, teamPerformances, soloqPerformances }: StatsContainerProps) {
  const [mode, setMode] = useState<Mode>('team');
  const [matchType, setMatchType] = useState<string>('all');
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(players.length > 0 ? players[0].id : null);
  const [championSearch, setChampionSearch] = useState('');
  const [profileTab, setProfileTab] = useState<'champions' | 'profile'>('champions');
  const [gameLimit, setGameLimit] = useState<'all' | 'last20'>('all');

  // Helper for image paths
  const getPlayerImageName = (name: string) => name.toLowerCase().replace(/\s+/g, '');

  // Normalize match type for grouping
  const normalizeMatchType = (type: string) => {
    if (type === 'scrim_bo1' || type === 'scrim_bo3') return 'scrim';
    return type;
  };

  const predefinedTypes = ['scrim', 'flex', 'clash']
  const customMatchTypes = useMemo(() => {
    const types = teamPerformances
      .map((perf: any) => {
        const rawType = perf.matches?.match_type
        return rawType ? normalizeMatchType(rawType).toLowerCase().trim() : null
      })
      .filter((t): t is string => Boolean(t))
    return Array.from(new Set(types)).filter(t => !predefinedTypes.includes(t))
  }, [teamPerformances])

  // Filter performances based on mode and matchType
  const filteredTeamPerformances = useMemo(() => {
    if (mode === 'soloq') return [];

    return teamPerformances.filter((perf: any) => {
      const type = normalizeMatchType(perf.matches?.match_type || '');
      if (matchType === 'all') return true;
      if (matchType === 'competitive') {
        return !['scrim', 'flex', 'clash'].includes(type);
      }
      return type === matchType;
    });
  }, [teamPerformances, mode, matchType]);

  const filteredSoloqPerformances = useMemo(() => {
    if (mode === 'team') return [];
    return soloqPerformances;
  }, [soloqPerformances, mode]);

  // Calculate Roster Stats
  const rosterStats = useMemo(() => {
    // Group team performances by match to determine MVP and INT per match
    const matchPerformances: Record<number, any[]> = {}
    filteredTeamPerformances.forEach((row: any) => {
      const matchId = row.matches?.id
      if (matchId) {
        if (!matchPerformances[matchId]) matchPerformances[matchId] = []
        matchPerformances[matchId].push(row)
      }
    })

    const playerMvpIntCounts: Record<number, { mvpCount: number; intMvpCount: number }> = {}
    Object.values(matchPerformances).forEach(playersInMatch => {
      const scoredPlayers = playersInMatch.filter((p: any) => typeof p.score === 'number' && p.score > 0)
      if (scoredPlayers.length < 2) return

      const sorted = [...scoredPlayers].sort((a, b) => b.score - a.score)
      const mvpPlayerId = sorted[0].player_id
      const intPlayerId = sorted[sorted.length - 1].player_id

      if (mvpPlayerId) {
        playerMvpIntCounts[mvpPlayerId] = playerMvpIntCounts[mvpPlayerId] || { mvpCount: 0, intMvpCount: 0 }
        playerMvpIntCounts[mvpPlayerId].mvpCount++
      }
      if (intPlayerId && intPlayerId !== mvpPlayerId) {
        playerMvpIntCounts[intPlayerId] = playerMvpIntCounts[intPlayerId] || { mvpCount: 0, intMvpCount: 0 }
        playerMvpIntCounts[intPlayerId].intMvpCount++
      }
    })

    const stats = players.map(player => {
      let tMatches = filteredTeamPerformances.filter(p => p.player_id === player.id);
      let sMatches = filteredSoloqPerformances.filter(p => p.player_id === player.id);

      // Sort matches by date descending (newest first)
      tMatches.sort((a, b) => new Date(b.matches?.date || 0).getTime() - new Date(a.matches?.date || 0).getTime());
      sMatches.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

      if (gameLimit === 'last20') {
        if (mode === 'team') {
          tMatches = tMatches.slice(0, 20);
        } else if (mode === 'soloq') {
          sMatches = sMatches.slice(0, 20);
        } else if (mode === 'mixed') {
          const combined = [
            ...tMatches.map(m => ({ ...m, unifiedDate: m.matches?.date })),
            ...sMatches.map(m => ({ ...m, unifiedDate: m.date }))
          ];
          combined.sort((a, b) => new Date(b.unifiedDate || 0).getTime() - new Date(a.unifiedDate || 0).getTime());
          const sliced = combined.slice(0, 20);
          tMatches = sliced.filter(m => m.matches !== undefined);
          sMatches = sliced.filter(m => m.matches === undefined);
        }
      }

      let wins = 0;
      let kills = 0;
      let deaths = 0;
      let assists = 0;
      let totalScore = 0;
      const mvpCount = playerMvpIntCounts[player.id]?.mvpCount || 0;
      const intMvpCount = playerMvpIntCounts[player.id]?.intMvpCount || 0;
      const champStats: Record<string, { games: number, wins: number, kills: number, deaths: number, assists: number }> = {};

      let gamesWithScore = 0;
      let totalGames = 0;

      const processMatch = (champion: string, win: boolean, k: number, d: number, a: number, score?: number) => {
        totalGames++;
        if (win) wins++;
        kills += k || 0;
        deaths += d || 0;
        assists += a || 0;

        if (typeof score === 'number' && score > 0) {
          totalScore += score;
          gamesWithScore++;
        }

        if (!champStats[champion]) {
          champStats[champion] = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
        }
        champStats[champion].games++;
        if (win) champStats[champion].wins++;
        champStats[champion].kills += k || 0;
        champStats[champion].deaths += d || 0;
        champStats[champion].assists += a || 0;
      };

      tMatches.forEach((row: any) => {
        processMatch(row.champion, row.matches?.we_won, row.kills, row.deaths, row.assists, row.score);
      });

      sMatches.forEach((row: any) => {
        processMatch(row.champion, row.win, row.kills, row.deaths, row.assists);
      });

      const winrate = totalGames > 0 ? (wins / totalGames) * 100 : 0;
      const overallKda = deaths === 0 ? (kills + assists) : (kills + assists) / deaths;
      const avgScore = gamesWithScore > 0 ? totalScore / gamesWithScore : 0;

      const topChampions = Object.entries(champStats)
        .map(([name, stats]) => {
          const champWinrate = (stats.wins / stats.games) * 100
          const champKda = stats.deaths === 0
            ? (stats.kills + stats.assists)
            : (stats.kills + stats.assists) / stats.deaths

          return {
            name,
            games: stats.games,
            winrate: champWinrate,
            kda: isNaN(champKda) ? 0 : Number(champKda.toFixed(2))
          }
        })
        .sort((a, b) => {
          if (b.games !== a.games) return b.games - a.games;
          return b.winrate - a.winrate;
        })
        .slice(0, 5)

      return {
        ...player,
        totalGames,
        wins,
        losses: totalGames - wins,
        winrate: Number(winrate.toFixed(1)),
        overallKda: Number(overallKda.toFixed(2)),
        avgScore: Number(avgScore.toFixed(1)),
        mvpCount,
        intMvpCount,
        topChampions
      }
    });

    stats.sort((a, b) => ROLE_ORDER.indexOf(a.role.toLowerCase()) - ROLE_ORDER.indexOf(b.role.toLowerCase()));
    return stats;
  }, [players, filteredTeamPerformances, filteredSoloqPerformances, gameLimit, mode]);

  const selectedPlayerStats = useMemo(() => {
    if (!selectedPlayerId) return null;

    let tMatches = filteredTeamPerformances.filter(p => p.player_id === selectedPlayerId);
    let sMatches = filteredSoloqPerformances.filter(p => p.player_id === selectedPlayerId);

    // Sort matches by date descending (newest first)
    tMatches.sort((a, b) => new Date(b.matches?.date || 0).getTime() - new Date(a.matches?.date || 0).getTime());
    sMatches.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    if (gameLimit === 'last20') {
      if (mode === 'team') {
        tMatches = tMatches.slice(0, 20);
      } else if (mode === 'soloq') {
        sMatches = sMatches.slice(0, 20);
      } else if (mode === 'mixed') {
        const combined = [
          ...tMatches.map(m => ({ ...m, unifiedDate: m.matches?.date })),
          ...sMatches.map(m => ({ ...m, unifiedDate: m.date }))
        ];
        combined.sort((a, b) => new Date(b.unifiedDate || 0).getTime() - new Date(a.unifiedDate || 0).getTime());
        const sliced = combined.slice(0, 20);
        tMatches = sliced.filter(m => m.matches !== undefined);
        sMatches = sliced.filter(m => m.matches === undefined);
      }
    }

    const champAggregator: Record<string, any> = {};

    const processMatch = (champion: string, win: boolean, k: number, d: number, a: number, cs: number, durMin: number, durSec: number) => {
      if (!champAggregator[champion]) {
        champAggregator[champion] = {
          championName: champion,
          games: 0, wins: 0, losses: 0,
          kills: 0, deaths: 0, assists: 0, cs: 0,
          totalMinutes: 0
        };
      }

      champAggregator[champion].games += 1;
      if (win) champAggregator[champion].wins += 1;
      else champAggregator[champion].losses += 1;

      champAggregator[champion].kills += k || 0;
      champAggregator[champion].deaths += d || 0;
      champAggregator[champion].assists += a || 0;
      champAggregator[champion].cs += cs || 0;

      const matchMinutes = (durMin || 0) + ((durSec || 0) / 60);
      champAggregator[champion].totalMinutes += matchMinutes;
    };

    tMatches.forEach((row: any) => {
      processMatch(
        row.champion,
        row.matches?.we_won,
        row.kills, row.deaths, row.assists, row.cs,
        row.matches?.duration_minutes, row.matches?.duration_seconds
      );
    });

    sMatches.forEach((row: any) => {
      processMatch(
        row.champion,
        row.win,
        row.kills, row.deaths, row.assists, row.cs,
        row.duration_minutes, row.duration_seconds
      );
    });

    let finalStats = Object.values(champAggregator).map((stat: any) => {
      const kda = stat.deaths === 0
        ? (stat.kills + stat.assists)
        : (stat.kills + stat.assists) / stat.deaths;

      const csPerMin = stat.totalMinutes > 0 ? stat.cs / stat.totalMinutes : 0;
      const winrate = (stat.wins / stat.games) * 100;

      return {
        championName: stat.championName,
        games: stat.games,
        wins: stat.wins,
        losses: stat.losses,
        winrate: Number(winrate.toFixed(1)),
        kills: Number((stat.kills / stat.games).toFixed(1)),
        deaths: Number((stat.deaths / stat.games).toFixed(1)),
        assists: Number((stat.assists / stat.games).toFixed(1)),
        kda: Number(kda.toFixed(2)),
        csPerMin: Number(csPerMin.toFixed(1))
      };
    });

    if (championSearch.trim()) {
      const query = championSearch.toLowerCase();
      finalStats = finalStats.filter(s => s.championName.toLowerCase().includes(query));
    }

    finalStats.sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games;
      return b.winrate - a.winrate;
    });

    return finalStats;
  }, [selectedPlayerId, filteredTeamPerformances, filteredSoloqPerformances, championSearch, gameLimit, mode]);

  const radarStatsAndProfile = useMemo(() => {
    if (!selectedPlayerId) return null;

    let tMatches = filteredTeamPerformances.filter(p => p.player_id === selectedPlayerId);
    let sMatches = filteredSoloqPerformances.filter(p => p.player_id === selectedPlayerId);

    // Sort matches by date descending (newest first)
    tMatches.sort((a, b) => new Date(b.matches?.date || 0).getTime() - new Date(a.matches?.date || 0).getTime());
    sMatches.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    if (gameLimit === 'last20') {
      if (mode === 'team') {
        tMatches = tMatches.slice(0, 20);
      } else if (mode === 'soloq') {
        sMatches = sMatches.slice(0, 20);
      } else if (mode === 'mixed') {
        const combined = [
          ...tMatches.map(m => ({ ...m, unifiedDate: m.matches?.date })),
          ...sMatches.map(m => ({ ...m, unifiedDate: m.date }))
        ];
        combined.sort((a, b) => new Date(b.unifiedDate || 0).getTime() - new Date(a.unifiedDate || 0).getTime());
        const sliced = combined.slice(0, 20);
        tMatches = sliced.filter(m => m.matches !== undefined);
        sMatches = sliced.filter(m => m.matches === undefined);
      }
    }

    const statsList: any[] = [];

    tMatches.forEach((row: any) => {
      const durMin = row.matches?.duration_minutes || 20;
      const durSec = row.matches?.duration_seconds || 0;
      const durationMinutes = durMin + (durSec / 60);

      statsList.push({
        durationMinutes,
        kills: row.kills || 0,
        deaths: row.deaths || 0,
        assists: row.assists || 0,
        cs: row.cs || 0,
        score: row.score || 50,
        damageDealt: row.damage_dealt || 0,
        goldEarned: row.gold_earned || 0,
        visionScore: row.vision_score || 0,
        damageTaken: row.damage_taken || 0,
        role: row.role || 'top',
        win: row.matches?.we_won || false,
        team_total_damage: row.team_total_damage || 0,
        team_total_gold: row.team_total_gold || 0,
        team_total_kills: row.team_total_kills || 0,
        team_total_deaths: row.team_total_deaths || 0,
      });
    });

    sMatches.forEach((row: any) => {
      const durMin = row.duration_minutes || 20;
      const durSec = row.duration_seconds || 0;
      const durationMinutes = durMin + (durSec / 60);

      statsList.push({
        durationMinutes,
        kills: row.kills || 0,
        deaths: row.deaths || 0,
        assists: row.assists || 0,
        cs: row.cs || 0,
        score: 50,
        damageDealt: row.damage_dealt || 0,
        goldEarned: row.gold_earned || 0,
        visionScore: row.vision_score || 0,
        damageTaken: row.damage_taken || 0,
        role: row.role || 'top',
        win: row.win || false,
        team_total_damage: row.team_total_damage || 0,
        team_total_gold: row.team_total_gold || 0,
        team_total_kills: row.team_total_kills || 0,
        team_total_deaths: row.team_total_deaths || 0,
      });
    });

    if (statsList.length === 0) return null;

    const role = players.find(p => p.id === selectedPlayerId)?.role || 'top';
    const stats = calculateRadarStats(statsList);
    const profile = determineArchetype(stats, role);
    const dynamicTraits = getDynamicTraits(statsList, stats, role);

    // Compute averages for summary view
    const totalGames = statsList.length;
    const avgKills = statsList.reduce((sum, p) => sum + p.kills, 0) / totalGames;
    const avgDeaths = statsList.reduce((sum, p) => sum + p.deaths, 0) / totalGames;
    const avgAssists = statsList.reduce((sum, p) => sum + p.assists, 0) / totalGames;
    const avgCs = statsList.reduce((sum, p) => sum + p.cs, 0) / totalGames;
    const avgCspm = statsList.reduce((sum, p) => sum + (p.cs / (p.durationMinutes || 20)), 0) / totalGames;
    const avgDpm = statsList.reduce((sum, p) => sum + ((p.damageDealt || 0) / (p.durationMinutes || 20)), 0) / totalGames;
    const avgGpm = statsList.reduce((sum, p) => sum + ((p.goldEarned || 0) / (p.durationMinutes || 20)), 0) / totalGames;
    const avgVspm = statsList.reduce((sum, p) => sum + ((p.visionScore || 0) / (p.durationMinutes || 20)), 0) / totalGames;

    return {
      stats,
      profile,
      dynamicTraits,
      badges: calculateBadges(statsList, stats, role),
      averages: {
        kills: avgKills.toFixed(1),
        deaths: avgDeaths.toFixed(1),
        assists: avgAssists.toFixed(1),
        kda: avgDeaths === 0 ? (avgKills + avgAssists).toFixed(2) : ((avgKills + avgAssists) / avgDeaths).toFixed(2),
        cs: Math.round(avgCs),
        cspm: avgCspm.toFixed(1),
        dpm: Math.round(avgDpm),
        gpm: Math.round(avgGpm),
        vspm: avgVspm.toFixed(2),
      }
    };
  }, [selectedPlayerId, filteredTeamPerformances, filteredSoloqPerformances, players, gameLimit, mode]);

  const activePlayer = players.find(p => p.id === selectedPlayerId);

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6 h-full overflow-hidden">
      <div className="flex flex-col xl:flex-row gap-6 h-full">

        {/* LEFT SIDEBAR (Players) */}
        <div className="w-full xl:w-[25%] flex flex-col gap-3 h-full overflow-hidden shrink-0">
          {rosterStats.map((stat: any) => {
            const isSelected = selectedPlayerId === stat.id;

            return (
              <div
                key={stat.id}
                onClick={() => setSelectedPlayerId(stat.id)}
                className={`cursor-pointer bg-card overflow-hidden flex flex-row items-center transition-all duration-300 relative group flex-1 min-h-[90px] ${isSelected
                  ? mode === 'soloq'
                    ? `border-2 scale-[1.02] z-10 ${getTierBorderColor(stat.soloq_tier)}`
                    : 'border-2 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.2)] scale-[1.02] dark:shadow-[0_0_20px_rgba(250,204,21,0.15)] z-10'
                  : mode === 'soloq'
                    ? `border border-zinc-200 dark:border-[#322814] hover:border-zinc-400 ${getTierBorderColor(stat.soloq_tier)}`
                    : 'border border-zinc-200 dark:border-[#322814] hover:border-yellow-400 dark:hover:border-[#c8aa6e]'
                  }`}
              >
                {/* Selected Glow Indicator */}
                {isSelected && mode !== 'soloq' && (
                  <div className="absolute inset-0 bg-yellow-500/5 dark:bg-yellow-400/5 z-0 pointer-events-none mix-blend-overlay"></div>
                )}

                {/* IMAGE LEFT */}
                <div className="w-[100px] sm:w-[120px] h-full relative overflow-hidden z-10 shrink-0">
                  <img
                    src={`/players/${getPlayerImageName(stat.name)}.jpg`}
                    alt=""
                    className={`w-full h-full object-cover object-top transition duration-500 ${isSelected ? 'scale-105' : 'group-hover:scale-105'} ${mode === 'soloq' ? 'opacity-60 blur-[1px] brightness-75' : ''}`}
                  />

                  {/* Ranked Emblem Overlay */}
                  {mode === 'soloq' && stat.soloq_tier && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                      <Image
                        src={`/emblems/${stat.soloq_tier.toLowerCase()}.png`}
                        alt={stat.soloq_tier}
                        width={64}
                        height={64}
                        className={`transition-all duration-300 object-contain ${isSelected ? 'scale-110 drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]' : 'opacity-80 drop-shadow-md group-hover:scale-110 group-hover:opacity-100'}`}
                      />
                    </div>
                  )}

                  {isSelected && mode !== 'soloq' && (
                    <div className="absolute inset-0 bg-blue-900/40 mix-blend-multiply"></div>
                  )}
                  <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-background/90 to-transparent z-10 pointer-events-none"></div>
                  <div className="absolute bottom-1 left-0 w-full text-center z-20">
                    <div className="text-yellow-500 font-black text-[9px] tracking-widest uppercase drop-shadow-md">
                      {stat.role}
                    </div>
                  </div>
                </div>

                {/* CONTENT RIGHT */}
                <div className="p-3 flex flex-col flex-1 relative z-10 h-full justify-between">
                  {/* Top Row: Name & ELO/WR */}
                  <div className="flex justify-between items-start">
                    <div className={`text-2xl sm:text-3xl font-black uppercase tracking-wider leading-none ${isSelected ? 'text-yellow-600 dark:text-yellow-400' : 'text-foreground'}`}>
                      {stat.name}
                    </div>
                    {/* ELO Display or WR */}
                    {mode === 'soloq' ? (
                      <div className="text-right">
                        <div className={`text-base font-black uppercase ${getTierTextColor(stat.soloq_tier)}`}>
                          {stat.soloq_tier ? `${stat.soloq_tier.substring(0, 3)} ${stat.soloq_rank}` : 'UNR'}
                        </div>
                      </div>
                    ) : (
                      <div className="text-right leading-none">
                        <div className={`text-lg font-black ${getColorWR(stat.winrate)}`}>
                          {stat.totalGames > 0 ? `${stat.winrate}%` : '-'}
                        </div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase mt-1">Winrate</div>
                      </div>
                    )}
                  </div>

                  {/* Bottom Row: Stats & Champs */}
                  <div className="flex justify-between items-end">
                    <div className="flex gap-3">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">KDA</span>
                        <span className={`text-sm font-bold ${getColorKDA(stat.overallKda)}`}>{stat.totalGames > 0 ? stat.overallKda.toFixed(2) : '-'}</span>
                      </div>
                      {mode === 'team' && (
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Score</span>
                          <span className={`text-sm font-bold ${stat.avgScore > 0 ? getColorAvgScore(stat.avgScore) : 'text-slate-400'}`}>{stat.avgScore > 0 ? Math.round(stat.avgScore) : '-'}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      {stat.topChampions.slice(0, 3).map((champ: any, idx: number) => (
                        <Image
                          key={idx}
                          src={getChampionIcon(champ.name) || '/placeholder-icon.png'}
                          alt={champ.name}
                          width={24}
                          height={24}
                          className="w-6 h-6 border border-slate-300 dark:border-slate-600 rounded-sm opacity-80 group-hover:opacity-100 transition-opacity"
                          title={`${champ.name}: ${champ.winrate.toFixed(0)}% WR`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* RIGHT SIDE (Filters + Detailed Stats) */}
        <div className="w-full xl:w-[75%] flex flex-col gap-6 h-full overflow-hidden">

          {/* Filters Section */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-card p-4 border border-blue-200/50 dark:border-[#322814] shadow-md rounded-xl shrink-0">
            <div className="flex flex-col sm:flex-row gap-4 items-center w-full md:w-auto">
              {/* Mode Toggle */}
              <div className="inline-flex bg-slate-100 dark:bg-[#0a0f18] p-1 rounded-lg shadow-inner">
                {(['team', 'soloq', 'mixed'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setMode(m);
                      if (m === 'soloq') setMatchType('all');
                    }}
                    className={`px-6 py-2 text-sm font-bold transition-all capitalize rounded-md ${mode === m
                      ? 'bg-gradient-to-b from-[#f1c40f] to-[#d4ac0d] text-slate-900 shadow-md border border-[#f39c12]'
                      : 'text-slate-600 dark:text-slate-300 hover:text-[#f39c12] hover:bg-white/50 dark:hover:bg-white/5'
                      }`}
                  >
                    {m === 'team' ? 'Team Stats' : m === 'soloq' ? 'SoloQ Stats' : 'Mixed Stats'}
                  </button>
                ))}
              </div>

              {/* Game Scope Toggle */}
              <div className="inline-flex bg-slate-100 dark:bg-[#0a0f18] p-1 rounded-lg shadow-inner">
                <button
                  onClick={() => setGameLimit('all')}
                  className={`px-4 py-2 text-sm font-bold transition-all rounded-md ${gameLimit === 'all'
                    ? 'bg-gradient-to-b from-[#f1c40f] to-[#d4ac0d] text-slate-900 shadow-md border border-[#f39c12]'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#f39c12] hover:bg-white/50 dark:hover:bg-white/5'
                    }`}
                >
                  All Games
                </button>
                <button
                  onClick={() => setGameLimit('last20')}
                  className={`px-4 py-2 text-sm font-bold transition-all rounded-md ${gameLimit === 'last20'
                    ? 'bg-gradient-to-b from-[#f1c40f] to-[#d4ac0d] text-slate-900 shadow-md border border-[#f39c12]'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#f39c12] hover:bg-white/50 dark:hover:bg-white/5'
                    }`}
                >
                  Last 20 Games
                </button>
              </div>
            </div>

            {/* Match Type Filters (Only for Team/Mixed) */}
            {(mode === 'team' || mode === 'mixed') && (
              <div className="flex gap-2 flex-wrap justify-center items-center">
                {(['all', 'competitive', 'scrim', 'flex', 'clash'] as string[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setMatchType(type)}
                    className={`px-4 py-1.5 text-xs font-bold rounded-full uppercase tracking-wider transition-all border ${matchType === type
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500 dark:border-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                      : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-800 hover:text-blue-500 dark:hover:text-blue-400'
                      }`}
                  >
                    {type}
                  </button>
                ))}

                {customMatchTypes.length > 0 && (
                  <select
                    value={['all', 'competitive', 'scrim', 'flex', 'clash'].includes(matchType) ? '' : matchType}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMatchType(val || 'all');
                    }}
                    className={`px-4 py-1.5 text-xs font-bold rounded-full uppercase tracking-wider transition-all border cursor-pointer outline-none ${
                      !['all', 'competitive', 'scrim', 'flex', 'clash'].includes(matchType)
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500 dark:border-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                        : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-800 hover:text-blue-500 dark:hover:text-blue-400'
                    }`}
                  >
                    <option value="" className="bg-card text-slate-600 dark:text-slate-300">
                      Other...
                    </option>
                    {customMatchTypes.map(t => (
                      <option key={t} value={t} className="bg-card text-slate-600 dark:text-slate-300">
                        {t}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* Detailed Champion Statistics Main Panel */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar rounded-xl border border-slate-200 dark:border-[#322814] bg-card shadow-lg relative">
            {selectedPlayerId && activePlayer ? (
              <div id="detailed-stats" className="p-6 relative min-h-full">
                {/* Background Elements */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3"></div>

                <div className="flex flex-col md:flex-row justify-between items-center mb-6 relative z-10 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div className="flex flex-col gap-2">
                    <h2 className="text-lg font-black text-foreground uppercase tracking-widest">
                      {mode === 'team' ? 'Team Performance' : mode === 'soloq' ? 'Solo Queue Performance' : 'Combined Performance'}
                      {matchType !== 'all' && mode !== 'soloq' ? ` • ${matchType.toUpperCase()}` : ''}
                    </h2>
                    {/* Inner Tabs for Champion Pool vs Performance Profile */}
                    <div className="flex gap-4 mt-2">
                      <button
                        onClick={() => setProfileTab('champions')}
                        className={`text-xs font-bold uppercase tracking-wider transition-all pb-1 border-b-2 ${profileTab === 'champions'
                          ? 'border-yellow-500 text-yellow-600 dark:text-yellow-400'
                          : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Champion Pool
                      </button>
                      <button
                        onClick={() => setProfileTab('profile')}
                        className={`text-xs font-bold uppercase tracking-wider transition-all pb-1 border-b-2 ${profileTab === 'profile'
                          ? 'border-yellow-500 text-yellow-600 dark:text-yellow-400'
                          : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Performance Profile
                      </button>
                    </div>
                  </div>

                  {profileTab === 'champions' && (
                    <div className="mt-4 md:mt-0 relative w-full md:w-64">
                      <input
                        type="text"
                        placeholder="Search champion..."
                        value={championSearch}
                        onChange={(e) => setChampionSearch(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-slate-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-foreground"
                      />
                      {championSearch && (
                        <button
                          onClick={() => setChampionSearch('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {profileTab === 'profile' ? (
                  radarStatsAndProfile ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start relative z-10 py-4">
                      {/* Left side: Radar chart */}
                      <div className="flex flex-col items-center justify-center bg-slate-900/40 dark:bg-black/20 p-6 rounded-2xl border border-slate-200/5 dark:border-white/5">
                        <h3 className="text-sm font-black text-[#c8aa6e] uppercase tracking-widest mb-6">Radar Analysis</h3>
                        <PlayerRadarChart stats={radarStatsAndProfile.stats} role={activePlayer.role} />
                      </div>

                      {/* Right side: Archetype details & stats */}
                      <div className={`p-6 rounded-2xl border ${radarStatsAndProfile.profile.badgeColor} ${radarStatsAndProfile.profile.glowColor} backdrop-blur-md flex flex-col justify-between h-full`}>
                        <div>
                          <div className="flex justify-between items-center mb-4">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Class Type</span>
                            <span className={`px-3 py-1 text-xs font-black uppercase tracking-wider rounded border ${radarStatsAndProfile.profile.badgeColor}`}>
                              {radarStatsAndProfile.profile.name}
                            </span>
                          </div>

                          <h3 className="text-3xl font-black text-foreground uppercase tracking-wide mb-3">
                            {activePlayer.name}
                          </h3>
                          
                          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6 font-medium">
                            {radarStatsAndProfile.profile.description}
                          </p>

                          <div className="mb-6 font-sans">
                            <h4 className="text-xs font-black uppercase tracking-widest text-[#c8aa6e] mb-3">Key Playstyle Traits</h4>
                            <div className="flex flex-wrap gap-2">
                              {radarStatsAndProfile.dynamicTraits.map((trait: any, i: number) => (
                                <div 
                                  key={i} 
                                  className="px-3 py-1 bg-slate-900/30 dark:bg-black/30 border border-slate-200/10 dark:border-white/10 text-xs font-bold text-slate-300 dark:text-slate-200 rounded-full relative group cursor-pointer transition-all duration-300 hover:border-[#c8aa6e]/30 hover:scale-105 select-none"
                                >
                                  <span>✦ {trait.name}</span>

                                  {/* Tooltip popup */}
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-[#091428] border border-[#c8aa6e]/30 rounded-lg shadow-2xl opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none z-50 text-left">
                                    <div className="font-black text-xs uppercase mb-1 text-[#c8aa6e]">
                                      {trait.name}
                                    </div>
                                    <p className="text-[11px] text-slate-300 font-medium leading-relaxed mb-2">
                                      {trait.description}
                                    </p>
                                    <div className="text-[9px] font-mono text-[#c8aa6e]/80 border-t border-slate-200/10 pt-1">
                                      Formula: {trait.formula}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Playstyle Badges */}
                          <div className="mb-6 font-sans">
                            <h4 className="text-xs font-black uppercase tracking-widest text-[#c8aa6e] mb-3">Playstyle Badges</h4>
                            <div className="flex flex-wrap gap-2">
                              {radarStatsAndProfile.badges.length > 0 ? (
                                radarStatsAndProfile.badges.map((badge, i) => (
                                  <div
                                    key={i}
                                    className={`px-3 py-1.5 rounded-lg border text-xs font-black flex items-center gap-1.5 select-none transition-all duration-300 hover:scale-105 cursor-pointer relative group ${
                                      badge.type === 'positive'
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:shadow-[0_0_12px_rgba(239,68,68,0.3)]'
                                    }`}
                                  >
                                    <span>{badge.icon}</span>
                                    <span>{badge.name}</span>

                                    {/* Tooltip popup */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-[#091428] border border-[#c8aa6e]/30 rounded-lg shadow-2xl opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none z-50 text-left">
                                      <div className={`font-black text-xs uppercase mb-1 ${badge.type === 'positive' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {badge.name} ({badge.type})
                                      </div>
                                      <p className="text-[11px] text-slate-300 font-medium leading-relaxed mb-2">
                                        {badge.description}
                                      </p>
                                      <div className="text-[9px] font-mono text-[#c8aa6e]/80 border-t border-slate-200/10 pt-1">
                                        Formula: {badge.formula}
                                      </div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <span className="text-xs text-slate-500 italic">No special playstyle badges detected. Keep playing!</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Summary Metrics */}
                        <div className="border-t border-slate-200/10 dark:border-white/10 pt-6 mt-6">
                          <h4 className="text-xs font-black uppercase tracking-widest text-[#c8aa6e] mb-4">Normalized Performance Metrics</h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <div className="bg-slate-900/20 dark:bg-black/20 p-3 rounded-lg border border-slate-200/5 dark:border-white/5">
                              <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Avg KDA</div>
                              <div className="text-lg font-black text-foreground mt-0.5">
                                {radarStatsAndProfile.averages.kda} <span className="text-xs font-medium text-slate-500 dark:text-slate-400">({radarStatsAndProfile.averages.kills} / {radarStatsAndProfile.averages.deaths} / {radarStatsAndProfile.averages.assists})</span>
                              </div>
                            </div>
                            <div className="bg-slate-900/20 dark:bg-black/20 p-3 rounded-lg border border-slate-200/5 dark:border-white/5">
                              <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">DPM</div>
                              <div className="text-lg font-black text-foreground mt-0.5">
                                {radarStatsAndProfile.averages.dpm || '-'}
                              </div>
                            </div>
                            <div className="bg-slate-900/20 dark:bg-black/20 p-3 rounded-lg border border-slate-200/5 dark:border-white/5">
                              <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">GPM</div>
                              <div className="text-lg font-black text-foreground mt-0.5">
                                {radarStatsAndProfile.averages.gpm || '-'}
                              </div>
                            </div>
                            {normalizeRole(activePlayer?.role || '').toLowerCase() !== 'support' && (
                              <>
                                <div className="bg-slate-900/20 dark:bg-black/20 p-3 rounded-lg border border-slate-200/5 dark:border-white/5">
                                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">CS / Min</div>
                                  <div className="text-lg font-black text-foreground mt-0.5">
                                    {radarStatsAndProfile.averages.cspm || '-'}
                                  </div>
                                </div>
                                <div className="bg-slate-900/20 dark:bg-black/20 p-3 rounded-lg border border-slate-200/5 dark:border-white/5">
                                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Avg CS/Game</div>
                                  <div className="text-lg font-black text-foreground mt-0.5">
                                    {radarStatsAndProfile.averages.cs || '-'}
                                  </div>
                                </div>
                              </>
                            )}
                            <div className="bg-slate-900/20 dark:bg-black/20 p-3 rounded-lg border border-slate-200/5 dark:border-white/5">
                              <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Vision / Min</div>
                              <div className="text-lg font-black text-foreground mt-0.5">
                                {radarStatsAndProfile.averages.vspm || '-'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-20 text-slate-500 font-medium text-lg bg-slate-50/50 dark:bg-black/20 rounded-xl">
                      Not enough performance data to compute profile.
                    </div>
                  )
                ) : (
                  !selectedPlayerStats || selectedPlayerStats.length === 0 ? (
                    <div className="text-center py-20 text-slate-500 font-medium text-lg bg-slate-50/50 dark:bg-black/20 rounded-xl">
                      No games match the current filters for {activePlayer.name}.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#322814] shadow-sm">
                      <table className="w-full text-left border-collapse table-fixed">
                        <thead>
                          <tr className="bg-slate-100 dark:bg-[#0a0f18] border-b border-slate-200 dark:border-[#322814] text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider">
                            <th className="p-4 font-black w-[20%]">Champion</th>
                            <th className="p-4 font-black text-center w-[12%]">Games</th>
                            <th className="p-4 font-black text-center w-[15%]">W - L</th>
                            <th className="p-4 font-black text-center w-[12%]">Winrate</th>
                            <th className="p-4 font-black text-center w-[21%]">K / D / A</th>
                            <th className="p-4 font-black text-center w-[10%]">KDA Ratio</th>
                            <th className="p-4 font-black text-center w-[10%]">CS/Min</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-[#322814]">
                          {selectedPlayerStats.map((stat: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-[#1e2328]/50 transition-colors group">
                              <td className="p-4 flex items-center gap-4">
                                <Image
                                  src={getChampionIcon(stat.championName) || '/placeholder-icon.png'}
                                  alt={stat.championName}
                                  width={40} height={40}
                                  className="w-10 h-10 border border-slate-200 dark:border-slate-700 shadow-sm rounded-sm group-hover:scale-110 transition-transform"
                                />
                                <span className="font-bold text-foreground text-sm tracking-wide">{stat.championName}</span>
                              </td>

                              <td className="p-4 text-center font-black text-lg text-yellow-600 dark:text-yellow-500">
                                {stat.games}
                              </td>

                              <td className="p-4 text-center text-slate-500 dark:text-slate-400 font-semibold text-xs tracking-wider">
                                <span className="text-emerald-500 dark:text-emerald-400">{stat.wins}W</span>
                                <span className="mx-2 text-slate-300 dark:text-slate-700">-</span>
                                <span className="text-rose-500 dark:text-rose-400">{stat.losses}L</span>
                              </td>

                              <td className="p-4 text-center">
                                <span className={`font-black text-lg ${getColorWR(stat.winrate)}`}>
                                  {stat.winrate}%
                                </span>
                              </td>

                              <td className="p-4 text-center text-slate-600 dark:text-slate-300 font-bold text-sm">
                                {stat.kills} <span className="text-slate-300 dark:text-slate-600 mx-1">/</span> <span className="text-rose-400">{stat.deaths}</span> <span className="text-slate-300 dark:text-slate-600 mx-1">/</span> {stat.assists}
                              </td>

                              <td className="p-4 text-center">
                                <span className={`font-black text-base ${getColorKDA(stat.kda)}`}>
                                  {stat.kda}
                                </span>
                              </td>

                              <td className="p-4 text-center">
                                <span className={`font-black text-base ${getColorCS(stat.csPerMin, activePlayer.role)}`}>
                                  {stat.csPerMin > 0 ? stat.csPerMin : '-'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center min-h-full p-12 text-center text-slate-500 font-medium">
                Select a player to view detailed statistics.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
