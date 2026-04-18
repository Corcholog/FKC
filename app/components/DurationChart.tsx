import React from 'react';

type MatchData = {
  duration_minutes: number;
  we_won: boolean;
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
    
    return {
      label: b.label,
      total,
      wins,
      losses,
      winrate,
    };
  });

  const getColor = (wr: number) => {
    if (wr >= 60) return 'bg-blue-500';
    if (wr >= 53) return 'bg-green-500';
    if (wr >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-700 shadow-lg flex flex-col w-full max-w-sm">
      <h3 className="text-zinc-400 font-bold text-xs uppercase tracking-widest text-center mb-8">{title}</h3>
      
      <div className="flex justify-between items-end h-44 gap-2 mt-2 mb-2">
        {data.map((b, i) => (
          <div key={i} className="flex flex-col items-center flex-1 group relative">
            {/* Tooltip on Hover */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-800 text-zinc-200 text-[10px] px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none font-bold">
              {b.total > 0 ? `${b.wins}W - ${b.losses}L` : 'No Games'}
            </div>
            
            {/* Y-Axis scale visualizer background */}
            <div className="w-full bg-zinc-900 rounded-t-lg relative flex flex-col justify-end h-36 border-b-2 border-zinc-700 hover:bg-zinc-800 transition-colors">
              {b.total > 0 && (
                <div 
                  className={`w-full rounded-t-lg transition-all duration-700 ${getColor(b.winrate)} group-hover:brightness-110 shadow-[0_0_10px_rgba(0,0,0,0.5)]`}
                  style={{ height: `${b.winrate}%`, minHeight: b.winrate > 0 ? '4px' : '0' }}
                >
                  {/* Inner text showing percentage */}
                  {b.winrate >= 20 && (
                     <span className="text-[10px] font-black text-black/70 flex justify-center mt-2 mix-blend-color-burn">
                       {Math.round(b.winrate)}%
                     </span>
                  )}
                </div>
              )}
            </div>
            {/* Label */}
            <div className="text-[10px] text-zinc-400 font-bold mt-4 whitespace-nowrap tracking-wider">{b.label}</div>
            <div className="text-[10px] text-zinc-600 font-medium mt-1">{b.total} G</div>
          </div>
        ))}
      </div>
    </div>
  );
}
