'use client'

import { useMemo, useState } from 'react'

interface PlayerRadarChartProps {
  stats: {
    carry: number
    farming: number
    fightPresence: number
    survivability: number
    consistency: number
  };
  role?: string;
}

const RADAR_TOOLTIPS: Record<string, Record<string, { label: string; formula: string; desc: string }>> = {
  top: {
    consistency: {
      label: 'Isolation Tolerance',
      formula: '(100 - min(80, Deaths * 12)) * (1.25 - Gold Share)',
      desc: 'Survival score weighted by low gold resource share. High score means you survive weakside with minimal resources.'
    },
    carry: {
      label: '1v9 Aggression',
      formula: '(DPM / 550) * 80',
      desc: 'Aggressiveness and raw damage output per minute relative to top-lane expectations.'
    },
    fightPresence: {
      label: 'TP Criminality',
      formula: '(Kill Participation / 50%) * 80',
      desc: 'How often you show up to fight with your team rather than splitpushing.'
    },
    survivability: {
      label: 'Meatshield Index',
      formula: '(Damage Taken / Deaths) / 4000 * 80',
      desc: 'How much damage you soak per death. High values mean you absorb massive heat for the team.'
    },
    farming: {
      label: 'CS Gooning',
      formula: '(CS/Min / 8.5) * 80',
      desc: 'How much you tunnel-vision on creep score while your team fights for their lives.'
    }
  },
  jungle: {
    consistency: {
      label: 'Objective Gooning',
      formula: '(Vision/Min / 1.2 * 50) + (Winrate * 50)',
      desc: 'Control over neutrals and map vision combined with match outcomes.'
    },
    carry: {
      label: 'Taxation Rate',
      formula: '(Gold Share / 18% * 50) + (CS/Min / 6.0 * 50)',
      desc: 'Measures how many resources you take from lanes and camps.'
    },
    fightPresence: {
      label: 'Gank Desperado',
      formula: '((Kills + Assists) / Min) / 0.40 * 80',
      desc: 'How frequently you force skirmishes and ganks per minute.'
    },
    survivability: {
      label: 'Smite Gambler',
      formula: '(Winrate * 70) + (Score * 0.3)',
      desc: 'Coined wins and match performance. Measures objective securing clutch factor.'
    },
    farming: {
      label: 'Terrorism Score',
      formula: '((Kills + Deaths) / Min) / 0.50 * 80',
      desc: 'Bloodshed density. High values mean you perma-fight with zero regard for pathing.'
    }
  },
  mid: {
    consistency: {
      label: 'Roamcel Factor',
      formula: '(Assists/Min / 0.25 * 50) + (Vision/Min / 0.8 * 50)',
      desc: 'Map rotation frequency. Measures map presence through assists and vision.'
    },
    carry: {
      label: 'DPS Engine',
      formula: '(DPM / 650) * 80',
      desc: 'Raw damage output per minute relative to a mid-lane carry expectation.'
    },
    fightPresence: {
      label: 'Main Character Aura',
      formula: 'Gold Share * Kill Share * 1500',
      desc: 'Ratio of resource funneling to kill contribution. High score means you hog the spotlight.'
    },
    survivability: {
      label: 'Survival Paranoia',
      formula: '(100 / (Deaths + 1)) * 1.5',
      desc: 'How desperately you preserve your life, mapping survival discipline.'
    },
    farming: {
      label: 'CS Vacuum',
      formula: '(CS/Min / 8.8) * 80',
      desc: 'Waves and camps cleared per minute relative to mid-lane carry targets.'
    }
  },
  adc: {
    consistency: {
      label: 'Fight Pilled',
      formula: '(Kill Participation / 70%) * 80',
      desc: 'Teamfight presence. High score means you are present at every major clash.'
    },
    carry: {
      label: 'DPS Spitfire',
      formula: '(DPM / 700) * 80',
      desc: 'Raw marksman damage per minute output in fights.'
    },
    fightPresence: {
      label: 'KDA Princess',
      formula: '(KDA Ratio / 4.5) * 80',
      desc: 'KDA safety margins. Reflects high kills/assists relative to deaths.'
    },
    survivability: {
      label: 'Glass Clunkiness',
      formula: '100 - (Deaths / DPM) * 15000',
      desc: 'Damage output efficiency relative to deaths. High values mean high output with low deaths.'
    },
    farming: {
      label: 'Gold Vacuum',
      formula: '(Gold Share / 26%) * 80',
      desc: 'Resource funneling. How much of the team gold is pocketed by you.'
    }
  },
  support: {
    consistency: {
      label: 'Income Allergies',
      formula: '(Assists / Gold) * 8000',
      desc: 'Economy efficiency. How many assists you produce with minimal gold income.'
    },
    carry: {
      label: 'Visionmaxxing',
      formula: '(Vision/Min / 1.8) * 80',
      desc: 'Warding output and clearance rate per minute.'
    },
    fightPresence: {
      label: 'Psycho Engage',
      formula: '((Assists + Deaths) / Min) / 0.45 * 80',
      desc: 'Initiation rate. Measures how aggressively you dive into the enemy team.'
    },
    survivability: {
      label: 'ADC Babysitter',
      formula: '(Winrate * 50) + ((1 - Death Share) * 50)',
      desc: 'Win rate combined with low death share, reflecting safety and protection.'
    },
    farming: {
      label: 'Map Roamer',
      formula: '(Kill Participation * 50) + (Vision/Min / 1.5 * 50)',
      desc: 'Map pressure. Measures roam efficiency through KP% and vision.'
    }
  }
};

const keyMap: Record<string, string> = {
  'Consistency': 'consistency',
  'Carry': 'carry',
  'Fight Presence': 'fightPresence',
  'Survivability': 'survivability',
  'Farming': 'farming'
};

export default function PlayerRadarChart({ stats, role = 'top' }: PlayerRadarChartProps) {
  const [activeTooltip, setActiveTooltip] = useState<{ label: string; formula: string; desc: string; x: number; y: number } | null>(null)

  // Using a wider viewBox (540x460) to give side labels ample side margin
  const width = 540
  const height = 460
  const cx = width / 2 // 270
  const cy = height / 2 // 230
  const r = 110 // Max radius for value 100

  // Helper to map generic dimensions to role-specific funny esports terms
  const getLabelForDimension = (name: string, pRole: string) => {
    const normRole = (pRole || 'top').toLowerCase();
    return RADAR_TOOLTIPS[normRole]?.[keyMap[name]]?.label || name;
  };

  const dimensions = useMemo(() => [
    { name: 'Consistency', value: stats.consistency, label: getLabelForDimension('Consistency', role) },
    { name: 'Carry', value: stats.carry, label: getLabelForDimension('Carry', role) },
    { name: 'Fight Presence', value: stats.fightPresence, label: getLabelForDimension('Fight Presence', role) },
    { name: 'Survivability', value: stats.survivability, label: getLabelForDimension('Survivability', role) },
    { name: 'Farming', value: stats.farming, label: getLabelForDimension('Farming', role) }
  ], [stats, role])

  // Compute angles for each dimension (0 = top, going clockwise)
  const getCoordinates = (index: number, val: number, radiusOffset = 1) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / 5
    const valueRatio = val / 100
    const x = cx + valueRatio * r * Math.cos(angle) * radiusOffset
    const y = cy + valueRatio * r * Math.sin(angle) * radiusOffset
    return { x, y }
  }

  // Points for the grid levels (25, 50, 75, 100)
  const gridLevels = [25, 50, 75, 100]

  // Main stats polygon points
  const polygonPoints = useMemo(() => {
    return dimensions
      .map((d, i) => {
        const { x, y } = getCoordinates(i, d.value)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [dimensions])

  // Track mouse coordinates to place the Hextech styled tooltip card
  const handleMouseMove = (e: React.MouseEvent, name: string, label: string) => {
    const container = e.currentTarget.ownerDocument.getElementById('radar-container');
    const rect = container?.getBoundingClientRect();
    if (rect) {
      const normRole = (role || 'top').toLowerCase();
      const tooltipKey = keyMap[name] || 'consistency';
      const tooltipInfo = RADAR_TOOLTIPS[normRole]?.[tooltipKey] || { label, formula: 'N/A', desc: '' };

      setActiveTooltip({
        label: tooltipInfo.label,
        formula: tooltipInfo.formula,
        desc: tooltipInfo.desc,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  return (
    <div
      id="radar-container"
      className="relative w-full max-w-[420px] mx-auto aspect-[540/460] flex items-center justify-center p-2 rounded-2xl bg-[#091428]/60 backdrop-blur-md border border-[#c8aa6e]/20 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
    >
      {/* Subtle outer glow grid */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(200,170,110,0.05)_0%,transparent_70%)] pointer-events-none" />

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full select-none animate-fade-in"
      >
        {/* Gradients definitions */}
        <defs>
          <radialGradient id="hextech-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#c8aa6e" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#1e2328" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="poly-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f0e6d2" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#c8aa6e" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* Outer Glow Circle */}
        <circle cx={cx} cy={cy} r={r} fill="url(#hextech-glow)" />

        {/* Pentagonal Grid Rings */}
        {gridLevels.map((level) => {
          const points = Array.from({ length: 5 })
            .map((_, i) => {
              const { x, y } = getCoordinates(i, level)
              return `${x.toFixed(1)},${y.toFixed(1)}`
            })
            .join(' ')

          return (
            <polygon
              key={level}
              points={points}
              fill="none"
              stroke="#c8aa6e"
              strokeWidth={level === 100 ? 1.5 : 0.75}
              strokeOpacity={level === 100 ? 0.35 : 0.15}
              strokeDasharray={level !== 100 ? "4,4" : undefined}
            />
          )
        })}

        {/* Grid Axis Lines from Center to Vertices */}
        {Array.from({ length: 5 }).map((_, i) => {
          const outerPoint = getCoordinates(i, 100)
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={outerPoint.x}
              y2={outerPoint.y}
              stroke="#c8aa6e"
              strokeWidth={1}
              strokeOpacity={0.15}
            />
          )
        })}

        {/* Stats Filled Area Polygon */}
        <polygon
          points={polygonPoints}
          fill="url(#poly-gradient)"
          stroke="#c8aa6e"
          strokeWidth={2}
          strokeLinejoin="round"
          className="transition-all duration-700 ease-out"
          style={{ filter: 'drop-shadow(0 0 6px rgba(200, 170, 110, 0.4))' }}
        />

        {/* Stat Vertices (Circles) */}
        {dimensions.map((d, i) => {
          const { x, y } = getCoordinates(i, d.value)
          return (
            <g
              key={d.name}
              className="group cursor-pointer"
              onMouseMove={(e) => handleMouseMove(e, d.name, d.label)}
              onMouseLeave={() => setActiveTooltip(null)}
            >
              {/* Invisible larger hover trigger */}
              <circle
                cx={x}
                cy={y}
                r={14}
                fill="transparent"
              />
              {/* Outer halo */}
              <circle
                cx={x}
                cy={y}
                r={6}
                fill="none"
                stroke="#f0e6d2"
                strokeWidth={1}
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              />
              {/* Core dot */}
              <circle
                cx={x}
                cy={y}
                r={4}
                fill="#f0e6d2"
                stroke="#c8aa6e"
                strokeWidth={1.5}
              />
            </g>
          )
        })}

        {/* Grid Labels */}
        {dimensions.map((d, i) => {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5
          const textDist = r + 24
          const labelX = cx + textDist * Math.cos(angle)
          const labelY = cy + textDist * Math.sin(angle)

          // Adjust text alignment based on position
          let textAnchor: "start" | "middle" | "end" = 'middle'
          let dy = '0.35em'

          if (Math.abs(Math.cos(angle)) < 0.1) {
            // Top or bottom
            textAnchor = 'middle'
            dy = Math.sin(angle) < 0 ? '-0.5em' : '1.2em'
          } else {
            textAnchor = Math.cos(angle) > 0 ? 'start' : 'end'
          }

          return (
            <g
              key={d.name}
              className="cursor-pointer group"
              onMouseMove={(e) => handleMouseMove(e, d.name, d.label)}
              onMouseLeave={() => setActiveTooltip(null)}
            >
              {/* Invisible label hover backing */}
              <rect
                x={labelX - (textAnchor === 'middle' ? 60 : textAnchor === 'end' ? 120 : 0)}
                y={labelY - 10}
                width={120}
                height={26}
                fill="transparent"
              />
              {/* Dimension Name */}
              <text
                x={labelX}
                y={labelY}
                dy={dy}
                textAnchor={textAnchor}
                className="font-sans font-black text-[13px] tracking-widest uppercase fill-[#c8aa6e] dark:fill-[#f0e6d2] group-hover:fill-[#ffebc8] transition-colors duration-150"
              >
                {d.label}
              </text>
              {/* Value Indicator (Subtext) */}
              <text
                x={labelX}
                y={labelY + (Math.sin(angle) < 0 ? -18 : 16)}
                dy={dy}
                textAnchor={textAnchor}
                className="font-mono text-[11px] font-bold fill-[#0984e3] dark:fill-[#c89b3c] group-hover:fill-[#ffca58] transition-colors duration-150"
              >
                {d.value}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Floating HTML Hextech Tooltip */}
      {activeTooltip && (
        <div
          className="absolute z-50 p-3 bg-[#091428]/95 border border-[#c8aa6e]/50 rounded-lg shadow-[0_12px_24px_rgba(0,0,0,0.8)] w-60 pointer-events-none transition-all duration-150 ease-out text-left"
          style={{
            left: `${activeTooltip.x}px`,
            top: `${activeTooltip.y}px`,
            transform: 'translate(-50%, -105%)'
          }}
        >
          <div className="font-sans font-black text-xs text-[#c8aa6e] uppercase tracking-wider mb-1">
            {activeTooltip.label}
          </div>
          <div className="font-sans text-[11px] text-slate-200 font-medium leading-relaxed mb-2">
            {activeTooltip.desc}
          </div>
          <div className="font-mono text-[9px] text-[#c8aa6e]/85 border-t border-slate-200/20 pt-1 leading-normal word-break break-all">
            Formula: {activeTooltip.formula}
          </div>
        </div>
      )}
    </div>
  )
}
