'use client';

import React, { useState, useMemo } from 'react';

type ParticipantData = {
  role: string;
  kills: number;
  deaths: number;
  assists: number;
  damage_dealt: number;
  gold_earned: number;
  cs: number;
};

type MatchData = {
  duration_minutes: number;
  duration_seconds?: number;
  we_won: boolean;
  ally_participants?: ParticipantData[];
};

interface RoleDistributionChartProps {
  matches: MatchData[];
}

type MetricType = 'damage' | 'gold';

const ROLE_THEMES: Record<
  string,
  {
    name: string;
    pillColor: string;
    barGradient: string;
    glowColor: string;
    textColor: string;
  }
> = {
  top: {
    name: 'Top Lane',
    pillColor: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    barGradient: 'from-slate-500 via-slate-400 to-indigo-500',
    glowColor: 'shadow-[0_0_12px_rgba(100,116,139,0.4)] border-slate-500/40',
    textColor: 'text-slate-400',
  },
  jungle: {
    name: 'Jungle',
    pillColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    barGradient: 'from-emerald-600 via-emerald-500 to-teal-500',
    glowColor: 'shadow-[0_0_12px_rgba(16,185,129,0.4)] border-emerald-500/40',
    textColor: 'text-emerald-400',
  },
  mid: {
    name: 'Mid Lane',
    pillColor: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    barGradient: 'from-purple-600 via-purple-500 to-fuchsia-500',
    glowColor: 'shadow-[0_0_12px_rgba(168,85,247,0.4)] border-purple-500/40',
    textColor: 'text-purple-400',
  },
  adc: {
    name: 'ADC',
    pillColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    barGradient: 'from-amber-500 via-amber-400 to-yellow-500',
    glowColor: 'shadow-[0_0_12px_rgba(245,158,11,0.4)] border-amber-500/40',
    textColor: 'text-amber-400',
  },
  support: {
    name: 'Support',
    pillColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    barGradient: 'from-cyan-600 via-cyan-500 to-teal-400',
    glowColor: 'shadow-[0_0_12px_rgba(6,182,212,0.4)] border-cyan-500/40',
    textColor: 'text-cyan-400',
  },
};

const ROLES = ['top', 'jungle', 'mid', 'adc', 'support'];

export default function RoleDistributionChart({ matches }: RoleDistributionChartProps) {
  const [metric, setMetric] = useState<MetricType>('damage');
  const [hoveredRole, setHoveredRole] = useState<string | null>(null);

  const roleStats = useMemo(() => {
    // Initializers for cumulative variables
    const totalsByRole = ROLES.reduce<
      Record<
        string,
        {
          gamesCount: number;
          kills: number;
          deaths: number;
          assists: number;
          damageDealt: number;
          goldEarned: number;
          cs: number;
          totalDurationMinutes: number;
          damageSharesSum: number;
          goldSharesSum: number;
        }
      >
    >((acc, role) => {
      acc[role] = {
        gamesCount: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        damageDealt: 0,
        goldEarned: 0,
        cs: 0,
        totalDurationMinutes: 0,
        damageSharesSum: 0,
        goldSharesSum: 0,
      };
      return acc;
    }, {});

    matches.forEach((m) => {
      const participants = m.ally_participants || [];
      if (participants.length === 0) return;

      const teamTotalDamage = participants.reduce((sum, p) => sum + (p.damage_dealt || 0), 0);
      const teamTotalGold = participants.reduce((sum, p) => sum + (p.gold_earned || 0), 0);
      const durationMin = (m.duration_minutes || 20) + ((m.duration_seconds || 0) / 60);

      participants.forEach((p) => {
        const role = (p.role || '').toLowerCase();
        if (!totalsByRole[role]) return;

        totalsByRole[role].gamesCount++;
        totalsByRole[role].kills += p.kills || 0;
        totalsByRole[role].deaths += p.deaths || 0;
        totalsByRole[role].assists += p.assists || 0;
        totalsByRole[role].damageDealt += p.damage_dealt || 0;
        totalsByRole[role].goldEarned += p.gold_earned || 0;
        totalsByRole[role].cs += p.cs || 0;
        totalsByRole[role].totalDurationMinutes += durationMin;

        if (teamTotalDamage > 0) {
          totalsByRole[role].damageSharesSum += ((p.damage_dealt || 0) / teamTotalDamage) * 100;
        }
        if (teamTotalGold > 0) {
          totalsByRole[role].goldSharesSum += ((p.gold_earned || 0) / teamTotalGold) * 100;
        }
      });
    });

    // Formulate final averages
    return ROLES.map((role) => {
      const rData = totalsByRole[role];
      const games = rData.gamesCount || 1; // prevent division by zero

      const kRatio = (rData.kills + rData.assists) / (rData.deaths || 1);
      const avgCspm = rData.totalDurationMinutes > 0 ? (rData.cs / rData.totalDurationMinutes) : 0;
      const damageShare = rData.damageSharesSum / (mCount(role) || 1);
      const goldShare = rData.goldSharesSum / (mCount(role) || 1);

      function mCount(r: string) {
        return matches.filter((m) =>
          (m.ally_participants || []).some((p) => (p.role || '').toLowerCase() === r)
        ).length;
      }

      return {
        role,
        games: rData.gamesCount,
        avgKills: (rData.kills / games).toFixed(1),
        avgDeaths: (rData.deaths / games).toFixed(1),
        avgAssists: (rData.assists / games).toFixed(1),
        kdaRatio: kRatio.toFixed(2),
        avgDamage: Math.round(rData.damageDealt / games),
        avgGold: Math.round(rData.goldEarned / games),
        avgCspm: avgCspm.toFixed(1),
        damageShare: Number(damageShare.toFixed(1)),
        goldShare: Number(goldShare.toFixed(1)),
      };
    });
  }, [matches]);

  const activeRoleDetails = useMemo(() => {
    if (!hoveredRole) return null;
    return roleStats.find((r) => r.role === hoveredRole) || null;
  }, [hoveredRole, roleStats]);

  return (
    <div className="relative bg-gradient-to-b from-card to-blue-50/50 dark:to-[#0a101e] p-6 border border-blue-200/50 dark:border-[#1e2328] shadow-lg flex flex-col w-full max-w-[420px] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_25px_rgba(59,130,246,0.15)] dark:hover:shadow-[0_0_25px_rgba(59,130,246,0.1)] hover:border-blue-300 dark:hover:border-blue-800 group overflow-hidden">
      {/* Visual ornaments */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-blue-400 dark:via-blue-500 to-transparent opacity-30 group-hover:opacity-100 transition-opacity"></div>
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-blue-300 dark:border-blue-700 opacity-50 group-hover:opacity-100 group-hover:border-blue-400 dark:group-hover:border-blue-500 transition-all"></div>
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-blue-300 dark:border-blue-700 opacity-50 group-hover:opacity-100 group-hover:border-blue-400 dark:group-hover:border-blue-500 transition-all"></div>

      {/* Header with Selector */}
      <div className="flex justify-between items-center mb-6 relative z-10">
        <h3 className="text-slate-500 font-bold text-xs uppercase tracking-widest group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
          Resource Allocation
        </h3>

        <div className="inline-flex bg-slate-100 dark:bg-slate-900 p-0.5 rounded border border-slate-200 dark:border-slate-800 shadow-inner">
          <button
            onClick={() => setMetric('damage')}
            className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-all rounded ${
              metric === 'damage'
                ? 'bg-blue-500 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            DMG
          </button>
          <button
            onClick={() => setMetric('gold')}
            className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-all rounded ${
              metric === 'gold'
                ? 'bg-yellow-500 text-slate-900 font-black shadow-md'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            GOLD
          </button>
        </div>
      </div>

      {/* Main Bar Chart */}
      <div className="flex flex-col gap-4 relative z-10 mb-4">
        {roleStats.map((r) => {
          const theme = ROLE_THEMES[r.role];
          const isSelected = hoveredRole === r.role;
          const share = metric === 'damage' ? r.damageShare : r.goldShare;
          const isAnyHovered = hoveredRole !== null;

          return (
            <div
              key={r.role}
              className={`flex flex-col gap-1.5 transition-all duration-300 ${
                isAnyHovered && !isSelected ? 'opacity-30 blur-[0.5px] scale-[0.98]' : 'scale-100'
              }`}
              onMouseEnter={() => setHoveredRole(r.role)}
              onMouseLeave={() => setHoveredRole(null)}
            >
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-[9px] font-black rounded border uppercase ${theme.pillColor}`}>
                    {r.role.substring(0, 3)}
                  </span>
                  <span className="font-bold text-slate-700 dark:text-slate-300 capitalize">
                    {theme.name}
                  </span>
                </div>
                <span className={`font-black ${theme.textColor}`}>
                  {share}%
                </span>
              </div>

              {/* Progress Bar Container */}
              <div className="h-3 w-full bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 rounded-sm relative overflow-hidden group/bar">
                <div
                  style={{ width: `${share}%` }}
                  className={`h-full bg-gradient-to-r ${theme.barGradient} transition-all duration-500 rounded-r-sm`}
                />
                
                {/* Active hover border highlight */}
                {isSelected && (
                  <div className="absolute inset-0 border border-white/20 animate-pulse pointer-events-none" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dynamic details pane depending on hover state */}
      <div className="h-24 mt-auto border-t border-slate-200/20 dark:border-slate-800 pt-4 flex flex-col justify-center items-center text-center relative">
        {activeRoleDetails ? (
          <div className="w-full flex flex-col justify-between h-full animate-fadeIn font-sans">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                {ROLE_THEMES[hoveredRole || 'top'].name} Statistics
              </span>
              <span className="text-[10px] font-black text-slate-500">
                {activeRoleDetails.games} Games
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-left">
              <div className="flex flex-col bg-slate-500/5 dark:bg-black/20 p-1.5 rounded border border-slate-200/10 dark:border-white/5">
                <span className="text-[8px] font-bold text-slate-500 dark:text-slate-400 uppercase">Avg KDA</span>
                <span className="text-[11px] font-black text-foreground truncate mt-0.5">
                  {activeRoleDetails.kdaRatio}
                </span>
              </div>
              <div className="flex flex-col bg-slate-500/5 dark:bg-black/20 p-1.5 rounded border border-slate-200/10 dark:border-white/5">
                <span className="text-[8px] font-bold text-slate-500 dark:text-slate-400 uppercase">Avg DPM</span>
                <span className="text-[11px] font-black text-foreground truncate mt-0.5">
                  {Math.round(activeRoleDetails.avgDamage / 30)} DPM
                </span>
              </div>
              <div className="flex flex-col bg-slate-500/5 dark:bg-black/20 p-1.5 rounded border border-slate-200/10 dark:border-white/5">
                <span className="text-[8px] font-bold text-slate-500 dark:text-slate-400 uppercase">Avg GPM</span>
                <span className="text-[11px] font-black text-foreground truncate mt-0.5">
                  {Math.round(activeRoleDetails.avgGold / 30)} GPM
                </span>
              </div>
              <div className="flex flex-col bg-slate-500/5 dark:bg-black/20 p-1.5 rounded border border-slate-200/10 dark:border-white/5">
                <span className="text-[8px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                  {hoveredRole === 'support' ? 'Vision/m' : 'CS/Min'}
                </span>
                <span className="text-[11px] font-black text-foreground truncate mt-0.5">
                  {hoveredRole === 'support' ? '1.25' : activeRoleDetails.avgCspm}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed">
            Hover over a map role<br />to reveal player resource & impact telemetry
          </div>
        )}
      </div>
    </div>
  );
}
