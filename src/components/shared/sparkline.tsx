'use client'

import { cn } from '@/lib/utils'

interface SparklineProps {
  values: number[]
  className?: string
  color?: string
  height?: number
  width?: number
}

// Tiny inline sparkline — no recharts overhead. Renders normalized bars.
export function Sparkline({
  values,
  className,
  color = 'currentColor',
  height = 24,
  width = 60,
}: SparklineProps) {
  if (!values || values.length === 0) {
    return <div className={cn('text-muted-foreground/40 text-[10px]', className)}>—</div>
  }
  const max = Math.max(...values, 1)
  const barWidth = Math.max(2, width / values.length - 1)
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('inline-block', className)}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Trend: ${values.length} data points`}
    >
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * (height - 2))
        const x = i * (width / values.length)
        const y = height - h
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={h}
            rx={1}
            fill={color}
            opacity={0.4 + (v / max) * 0.6}
          />
        )
      })}
    </svg>
  )
}
