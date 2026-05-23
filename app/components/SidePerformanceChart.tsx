'use client';

import React, { useMemo } from 'react';

type ParticipantData = {
  kills: number;
  deaths: number;
  assists: number;
};

type MatchData = {
  duration_minutes: number;
  duration_seconds?: number;
  we_won: boolean;
  our_side: 'Blue' | 'Red';
  ally_participants?: ParticipantData[];
};

interface SidePerformanceChartProps {
  matches: MatchData[];
}

export default function SidePerformanceChart({ matches }: SidePerformanceChartProps) {
  const stats = useMemo(() => {
    let blueGames = 0;
    let blueWins = 0;
    let blueKills = 0;
    let blueDeaths = 0;
    let blueDurationSeconds = 0;

    let redGames = 0;
    let redWins = 0;
    let redKills = 0;
    let redDeaths = 0;
    let redDurationSeconds = 0;

    matches.forEach((m) => {
      const side = m.our_side || 'Blue';
      const won = m.we_won;
      const durSec = (m.duration_minutes || 0) * 60 + (m.duration_seconds || 0);

      // Sum ally kills/deaths
      let killsSum = 0;
      let deathsSum = 0;
      if (m.ally_participants && Array.isArray(m.ally_participants)) {
        m.ally_participants.forEach((p) => {
          killsSum += p.kills || 0;
          deathsSum += p.deaths || 0;
        });
      }

      if (side === 'Blue') {
        blueGames++;
        if (won) blueWins++;
        blueKills += killsSum;
        blueDeaths += deathsSum;
        blueDurationSeconds += durSec;
      } else {
        redGames++;
        if (won) redWins++;
        redKills += killsSum;
        redDeaths += deathsSum;
        redDurationSeconds += durSec;
      }
    });

    const formatAvgDuration = (totalSeconds: number, gamesCount: number): string => {
      if (gamesCount === 0) return '0:00';
      const avgSec = Math.round(totalSeconds / gamesCount);
      const m = Math.floor(avgSec / 60);
      const s = avgSec % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const blueWr = blueGames > 0 ? (blueWins / blueGames) * 100 : 0;
    const redWr = redGames > 0 ? (redWins / redGames) * 100 : 0;

    return {
      blue: {
        games: blueGames,
        wins: blueWins,
        losses: blueGames - blueWins,
        winrate: blueWr,
        avgKills: blueGames > 0 ? (blueKills / blueGames).toFixed(1) : '0.0',
        avgDeaths: blueGames > 0 ? (blueDeaths / blueGames).toFixed(1) : '0.0',
        avgDuration: formatAvgDuration(blueDurationSeconds, blueGames),
      },
      red: {
        games: redGames,
        wins: redWins,
        losses: redGames - redWins,
        winrate: redWr,
        avgKills: redGames > 0 ? (redKills / redGames).toFixed(1) : '0.0',
        avgDeaths: redGames > 0 ? (redDeaths / redGames).toFixed(1) : '0.0',
        avgDuration: formatAvgDuration(redDurationSeconds, redGames),
      },
    };
  }, [matches]);

  // SVG parameters for the circular gauge
  const radius = 50;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;

  const blueDashOffset = circumference - (stats.blue.winrate / 100) * circumference;
  const redDashOffset = circumference - (stats.red.winrate / 100) * circumference;

  return (
    <div className="relative bg-gradient-to-b from-card to-blue-50/50 dark:to-[#0a101e] p-6 border border-blue-200/50 dark:border-[#1e2328] shadow-lg flex flex-col w-full max-w-[420px] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_25px_rgba(59,130,246,0.15)] dark:hover:shadow-[0_0_25px_rgba(59,130,246,0.1)] hover:border-blue-300 dark:hover:border-blue-800 group overflow-hidden">
      {/* Hextech design borders */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-blue-400 dark:via-blue-500 to-transparent opacity-30 group-hover:opacity-100 transition-opacity"></div>
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-blue-300 dark:border-blue-700 opacity-50 group-hover:opacity-100 group-hover:border-blue-400 dark:group-hover:border-blue-500 transition-all"></div>
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-blue-300 dark:border-blue-700 opacity-50 group-hover:opacity-100 group-hover:border-blue-400 dark:group-hover:border-blue-500 transition-all"></div>
      <div className="absolute -right-4 -top-4 w-16 h-16 bg-blue-400/5 dark:bg-blue-600/5 rounded-full blur-xl group-hover:bg-blue-400/10 dark:group-hover:bg-blue-600/10 transition-colors"></div>

      <h3 className="text-slate-500 font-bold text-xs uppercase tracking-widest text-center mb-6 relative z-10 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
        Map Side Performance
      </h3>

      <div className="grid grid-cols-2 gap-6 relative z-10">
        
        {/* BLUE SIDE PROFILE */}
        <div className="flex flex-col items-center p-3 rounded-xl bg-blue-500/5 dark:bg-[#0077b6]/5 border border-blue-200/20 dark:border-blue-500/10 transition-all duration-300 hover:bg-blue-500/10 hover:border-blue-400/30 group/blue">
          {/* Animated Circular Gauge */}
          <div className="relative w-28 h-28 flex items-center justify-center mb-4 select-none">
            <svg className="w-full h-full transform -rotate-95">
              <circle
                cx="56"
                cy="56"
                r={radius}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeWidth={strokeWidth}
                fill="transparent"
              />
              <circle
                cx="56"
                cy="56"
                r={radius}
                className="stroke-blue-500 dark:stroke-blue-400 drop-shadow-[0_0_6px_rgba(59,130,246,0.5)] transition-all duration-1000 ease-out"
                strokeWidth={strokeWidth}
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={blueDashOffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute text-center">
              <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                {Math.round(stats.blue.winrate)}%
              </span>
              <span className="block text-[8px] text-slate-400 uppercase font-black tracking-widest leading-none mt-0.5">
                Blue WR
              </span>
            </div>
            
            {/* Quick stats floating tooltip */}
            <div className="absolute inset-0 opacity-0 group-hover/blue:opacity-100 transition-opacity bg-slate-900/95 border border-blue-400/40 rounded-lg p-2 flex flex-col justify-center items-center text-center text-white pointer-events-none shadow-2xl z-20">
              <div className="text-[10px] font-black text-blue-400 tracking-wider uppercase mb-1">Blue Record</div>
              <div className="text-sm font-black">{stats.blue.wins}W - {stats.blue.losses}L</div>
              <div className="text-[9px] text-slate-400 mt-1">{stats.blue.games} Games Played</div>
            </div>
          </div>

          <div className="text-center w-full">
            <span className="px-3 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-black tracking-widest uppercase rounded border border-blue-500/20">
              Blue Side
            </span>
            
            <div className="mt-4 flex flex-col gap-2.5 text-left px-1">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400 font-bold uppercase tracking-wider">Record</span>
                <span className="font-black text-slate-700 dark:text-slate-200">
                  {stats.blue.wins}W - {stats.blue.losses}L
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400 font-bold uppercase tracking-wider">Avg Kills</span>
                <span className="font-black text-slate-700 dark:text-slate-200">
                  {stats.blue.avgKills} <span className="text-[8px] font-medium text-slate-400">/ G</span>
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400 font-bold uppercase tracking-wider">Avg Deaths</span>
                <span className="font-black text-slate-700 dark:text-slate-200">
                  {stats.blue.avgDeaths} <span className="text-[8px] font-medium text-slate-400">/ G</span>
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400 font-bold uppercase tracking-wider">Avg Length</span>
                <span className="font-black text-slate-700 dark:text-slate-200">
                  {stats.blue.avgDuration}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RED SIDE PROFILE */}
        <div className="flex flex-col items-center p-3 rounded-xl bg-rose-500/5 dark:bg-[#b9003a]/5 border border-rose-200/20 dark:border-rose-500/10 transition-all duration-300 hover:bg-rose-500/10 hover:border-rose-400/30 group/red">
          {/* Animated Circular Gauge */}
          <div className="relative w-28 h-28 flex items-center justify-center mb-4 select-none">
            <svg className="w-full h-full transform -rotate-95">
              <circle
                cx="56"
                cy="56"
                r={radius}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeWidth={strokeWidth}
                fill="transparent"
              />
              <circle
                cx="56"
                cy="56"
                r={radius}
                className="stroke-rose-500 dark:stroke-rose-400 drop-shadow-[0_0_6px_rgba(244,63,94,0.5)] transition-all duration-1000 ease-out"
                strokeWidth={strokeWidth}
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={redDashOffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute text-center">
              <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
                {Math.round(stats.red.winrate)}%
              </span>
              <span className="block text-[8px] text-slate-400 uppercase font-black tracking-widest leading-none mt-0.5">
                Red WR
              </span>
            </div>
            
            {/* Quick stats floating tooltip */}
            <div className="absolute inset-0 opacity-0 group-hover/red:opacity-100 transition-opacity bg-slate-900/95 border border-rose-400/40 rounded-lg p-2 flex flex-col justify-center items-center text-center text-white pointer-events-none shadow-2xl z-20">
              <div className="text-[10px] font-black text-rose-400 tracking-wider uppercase mb-1">Red Record</div>
              <div className="text-sm font-black">{stats.red.wins}W - {stats.red.losses}L</div>
              <div className="text-[9px] text-slate-400 mt-1">{stats.red.games} Games Played</div>
            </div>
          </div>

          <div className="text-center w-full">
            <span className="px-3 py-0.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-black tracking-widest uppercase rounded border border-rose-500/20">
              Red Side
            </span>
            
            <div className="mt-4 flex flex-col gap-2.5 text-left px-1">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400 font-bold uppercase tracking-wider">Record</span>
                <span className="font-black text-slate-700 dark:text-slate-200">
                  {stats.red.wins}W - {stats.red.losses}L
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400 font-bold uppercase tracking-wider">Avg Kills</span>
                <span className="font-black text-slate-700 dark:text-slate-200">
                  {stats.red.avgKills} <span className="text-[8px] font-medium text-slate-400">/ G</span>
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400 font-bold uppercase tracking-wider">Avg Deaths</span>
                <span className="font-black text-slate-700 dark:text-slate-200">
                  {stats.red.avgDeaths} <span className="text-[8px] font-medium text-slate-400">/ G</span>
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400 font-bold uppercase tracking-wider">Avg Length</span>
                <span className="font-black text-slate-700 dark:text-slate-200">
                  {stats.red.avgDuration}
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
