'use client'

import { cn } from '@/lib/utils'

// Renders a Code128-style visual barcode (decorative — value shown below).
// Not a scannable barcode, but a faithful UI representation for ID cards & lists.
interface BarcodeProps {
  value: string
  height?: number
  className?: string
  showText?: boolean
}

function pseudoBars(value: string): number[] {
  // Deterministic bar widths from the value characters
  const bars: number[] = []
  const seed = value || 'EMPTY'
  for (let i = 0; i < Math.max(40, seed.length * 5); i++) {
    const ch = seed.charCodeAt(i % seed.length)
    bars.push(((ch * (i + 3)) % 4) + 1) // widths 1..4
  }
  return bars
}

export function Barcode({ value, height = 56, className, showText = true }: BarcodeProps) {
  const unit = 2
  const bars = pseudoBars(value)
  // Precompute x offsets so we don't mutate during render
  const offsets: number[] = []
  let acc = 0
  for (const w of bars) {
    offsets.push(acc)
    acc += w * unit
  }
  const totalWidth = acc
  return (
    <div className={cn('inline-flex flex-col items-center gap-1', className)}>
      <svg
        width={totalWidth}
        height={height}
        viewBox={`0 0 ${totalWidth} ${height}`}
        role="img"
        aria-label={`Barcode ${value}`}
      >
        {bars.map((w, i) => (
          <rect
            key={i}
            x={offsets[i]}
            y={0}
            width={w * unit}
            height={height}
            fill={i % 2 === 0 ? 'currentColor' : 'transparent'}
          />
        ))}
      </svg>
      {showText && (
        <span className="font-mono text-xs tracking-[0.2em] text-foreground">{value}</span>
      )}
    </div>
  )
}
