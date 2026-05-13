'use client'

interface Props {
  fromTop: number
  fromBottom: number
  toTop: number
  direction?: 'vertical' | 'horizontal'
  isWinner?: boolean
  animated?: boolean
}

/**
 * SVG connector that visually links tournament matches
 * Uses Riot-style golden lines with subtle glow
 */
export default function BracketConnector({
  fromTop,
  fromBottom,
  toTop,
  direction = 'vertical',
  isWinner = false,
  animated = false
}: Props) {
  const midY = (fromTop + fromBottom) / 2
  const targetY = toTop + 32 // Match node height / 2

  // For horizontal, assume fromLeft, toLeft, etc.
  // But since SVG is positioned absolutely, for horizontal, we can mirror the path.

  const isHorizontal = direction === 'horizontal'

  // Golden line color with conditional intensity
  const lineColor = isWinner ? '#f0c75e' : '#c89b3c'
  const glowColor = isWinner ? 'rgba(240, 199, 94, 0.6)' : 'rgba(200, 155, 60, 0.4)'

  // Path for vertical: down
  // For horizontal: right, so swap x and y or adjust.

  // To make horizontal, we can rotate the SVG or adjust the path.
  // Let's adjust the path: for horizontal, make it go right.

  const pathD = isHorizontal
    ? `M ${midY} 0 L ${midY} 24 L ${targetY} 24 L ${targetY} 48`
    : `M 0 ${midY} L 24 ${midY} L 24 ${targetY} L 48 ${targetY}`

  const glowPathD = isHorizontal
    ? `M ${midY} 0 L ${midY} 24 L ${targetY} 24 L ${targetY} 48`
    : `M 0 ${midY} L 24 ${midY} L 24 ${targetY} L 48 ${targetY}`

  const circle1 = isHorizontal
    ? { cx: midY, cy: 0, r: 3 }
    : { cx: 0, cy: midY, r: 3 }

  const circle2 = isHorizontal
    ? { cx: targetY, cy: 48, r: 3 }
    : { cx: 48, cy: targetY, r: 3 }

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        width: '100%',
        height: '100%',
        top: 0,
        left: 0
      }}
      preserveAspectRatio="none"
    >
      <defs>
        <filter id="goldenGlow">
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {animated && (
          <style>{`
            @keyframes bracketPulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.4; }
            }
            .bracket-connector {
              animation: bracketPulse 2s ease-in-out infinite;
            }
          `}</style>
        )}
      </defs>

      {/* Glow layer for aesthetic */}
      <path
        d={glowPathD}
        stroke={glowColor}
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
        filter="url(#goldenGlow)"
      />

      {/* Main line */}
      <path
        d={pathD}
        stroke={lineColor}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        className={animated ? 'bracket-connector' : ''}
      />

      {/* Connection points */}
      <circle cx={circle1.cx} cy={circle1.cy} r={circle1.r} fill={lineColor} opacity="0.8" />
      <circle cx={circle2.cx} cy={circle2.cy} r={circle2.r} fill={lineColor} opacity="0.8" />
    </svg>
  )
}
