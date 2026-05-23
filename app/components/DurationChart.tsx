'use client';

import React from 'react';

type ParticipantData = {
  kills: number;
  deaths: number;
  assists: number;
};

type MatchData = {
  duration_minutes: number;
  duration_seconds?: number;
  we_won: boolean;
  ally_participants?: ParticipantData[];
};

interface DurationChartProps {
  title: string;
  matches: MatchData[];
}

const brackets = [
  { label: '< 25m', min: 0, max: 24.999 },
  { label: '25-30m', min: 25, max: 29.999 },
  { label: '30-35m', min: 30, max: 34.999 },
  { label: '35m+', min: 35, max: 999 },
];

export default function DurationChart({ title, matches }: DurationChartProps) {
  const data = brackets.map((b) => {
    const bucket = matches.filter(
      (m) =>
        typeof m.duration_minutes === 'number' &&
        m.duration_minutes >= b.min &&
        m.duration_minutes <= b.max
    );
    const total = bucket.length;
    const wins = bucket.filter((m) => m.we_won).length;
    const losses = total - wins;
    const winrate = total > 0 ? (wins / total) * 100 : 0;

    // Calculate Average Team K/D/A and ratio for matches in this bucket
    let totalKills = 0;
    let totalDeaths = 0;
    let totalAssists = 0;
    bucket.forEach((m) => {
      if (m.ally_participants && Array.isArray(m.ally_participants)) {
        m.ally_participants.forEach((p) => {
          totalKills += p.kills || 0;
          totalDeaths += p.deaths || 0;
          totalAssists += p.assists || 0;
        });
      }
    });

    const avgK = total > 0 ? (totalKills / total).toFixed(1) : '0.0';
    const avgD = total > 0 ? (totalDeaths / total).toFixed(1) : '0.0';
    const avgA = total > 0 ? (totalAssists / total).toFixed(1) : '0.0';
    const kdaRatio = totalDeaths > 0
      ? ((totalKills + totalAssists) / totalDeaths).toFixed(2)
      : (totalKills + totalAssists).toFixed(2);

    return {
      label: b.label,
      total,
      wins,
      losses,
      winrate,
      avgK,
      avgD,
      avgA,
      kdaRatio,
    };
  });

  const getColor = (wr: number) => {
    if (wr >= 60) return 'bg-gradient-to-t from-blue-600 to-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.4)]';
    if (wr >= 53) return 'bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.4)]';
    if (wr >= 50) return 'bg-gradient-to-t from-yellow-600 to-yellow-400 shadow-[0_0_10px_rgba(245,158,11,0.4)]';
    return 'bg-gradient-to-t from-rose-600 to-rose-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]';
  };

  return (
    <div className="relative bg-gradient-to-b from-card to-blue-50/50 dark:to-[#0a101e] p-6 border border-blue-200/50 dark:border-[#1e2328] shadow-lg flex flex-col w-full max-w-[420px] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_25px_rgba(59,130,246,0.15)] dark:hover:shadow-[0_0_25px_rgba(59,130,246,0.1)] hover:border-blue-300 dark:hover:border-blue-800 group overflow-hidden">
      {/* Hextech styling ornament */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-blue-400 dark:via-blue-500 to-transparent opacity-30 group-hover:opacity-100 transition-opacity"></div>
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-blue-300 dark:border-blue-700 opacity-50 group-hover:opacity-100 group-hover:border-blue-400 dark:group-hover:border-blue-500 transition-all"></div>
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-blue-300 dark:border-blue-700 opacity-50 group-hover:opacity-100 group-hover:border-blue-400 dark:group-hover:border-blue-500 transition-all"></div>

      <h3 className="text-slate-500 font-bold text-xs uppercase tracking-widest text-center mb-8 relative z-10 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
        {title}
      </h3>

      <div className="flex justify-between items-end h-44 gap-3 mt-6 mb-2 relative z-10">
        {data.map((b, i) => (
          <div key={i} className="flex flex-col items-center flex-1 group relative">
            {/* Simple Tooltip on Hover */}
            <div className="absolute -top-9 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-slate-900 border border-slate-700 text-white py-1 px-2.5 rounded-lg shadow-2xl z-20 pointer-events-none text-center w-22 scale-95 group-hover:scale-100 font-sans">
              {b.total > 0 ? (
                <div className="text-[10px] font-black text-blue-400">
                  {b.wins}W - {b.losses}L
                </div>
              ) : (
                <div className="text-[9px] text-slate-400 font-medium">No Games</div>
              )}
            </div>

            {/* Y-Axis scale visualizer background */}
            <div className="w-full bg-blue-50/30 dark:bg-blue-950/10 relative flex flex-col justify-end h-36 border-b-2 border-slate-200 dark:border-[#322814] hover:bg-blue-50/80 dark:hover:bg-blue-900/20 transition-all duration-300 rounded-t-sm group/bar overflow-hidden">
              {b.total > 0 && (
                <div
                  className={`w-full transition-all duration-700 ${getColor(
                    b.winrate
                  )} group-hover/bar:brightness-110 shadow-[0_0_10px_rgba(0,0,0,0.5)] rounded-t-[1px]`}
                  style={{ height: `${b.winrate}%`, minHeight: b.winrate > 0 ? '6px' : '0' }}
                >
                  {/* Inner text showing percentage */}
                  {b.winrate >= 25 && (
                    <span className="text-[10px] font-black text-white flex justify-center mt-2 drop-shadow-md select-none">
                      {Math.round(b.winrate)}%
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Label */}
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mt-4 whitespace-nowrap tracking-wider">
              {b.label}
            </div>
            <div className="text-[9px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">
              {b.total} G
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
