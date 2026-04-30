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
    <div className="relative bg-gradient-to-b from-card to-blue-50/50 dark:to-[#0a101e] p-6 border border-blue-200/50 dark:border-[#1e2328] shadow-lg flex flex-col w-full max-w-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] dark:hover:shadow-[0_0_20px_rgba(59,130,246,0.1)] hover:border-blue-300 dark:hover:border-blue-800 group overflow-hidden">
      {/* Hextech styling */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-blue-400 dark:via-blue-500 to-transparent opacity-30 group-hover:opacity-100 transition-opacity"></div>
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-blue-300 dark:border-blue-700 opacity-50 group-hover:opacity-100 group-hover:border-blue-400 dark:group-hover:border-blue-500 transition-all"></div>
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-blue-300 dark:border-blue-700 opacity-50 group-hover:opacity-100 group-hover:border-blue-400 dark:group-hover:border-blue-500 transition-all"></div>
      <div className="absolute -right-4 -top-4 w-16 h-16 bg-blue-400/5 dark:bg-blue-600/5 rounded-full blur-xl group-hover:bg-blue-400/10 dark:group-hover:bg-blue-600/10 transition-colors"></div>

      <h3 className="text-slate-500 font-bold text-xs uppercase tracking-widest text-center mb-8 relative z-10 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">{title}</h3>
      
      <div className="flex justify-between items-end h-44 gap-2 mt-2 mb-2 relative z-10">
        {data.map((b, i) => (
          <div key={i} className="flex flex-col items-center flex-1 group relative">
            {/* Tooltip on Hover */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none font-bold shadow-md">
              {b.total > 0 ? `${b.wins}W - ${b.losses}L` : 'No Games'}
            </div>
            
            {/* Y-Axis scale visualizer background */}
            <div className="w-full bg-blue-50/50 dark:bg-blue-950/20 relative flex flex-col justify-end h-36 border-b-2 border-slate-200 dark:border-[#322814] hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors group/bar">
               {b.total > 0 && (
                 <div 
                   className={`w-full transition-all duration-700 ${getColor(b.winrate)} group-hover/bar:brightness-110 shadow-[0_0_10px_rgba(0,0,0,0.5)]`}
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
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mt-4 whitespace-nowrap tracking-wider">{b.label}</div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-1">{b.total} G</div>
          </div>
        ))}
      </div>
    </div>
  );
}
